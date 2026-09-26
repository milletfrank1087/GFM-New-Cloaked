const express = require('express');
const { decomposeAmount } = require('../lib/decompose');
const { toSmallestUnit, fromSmallestUnit, getDecimals, formatAmount } = require('../lib/currency');
const { StoreLog, fmtAmount, extractOriginHost } = require('../lib/logger');
const { resolveCampaignCallbackUrl } = require('../lib/campaign-routing');
const { classifyStripeError, getDonorMessage } = require('../lib/stripe-errors');
const { sendDonationConfirmation, sendSubscriptionConfirmation } = require('../lib/email');
const upsell = require('../lib/upsell');
const { CHECKOUT_LOCALE } = require('../lib/locale');

module.exports = function createStripeRouter(ctx) {
  const { stripe, supabase, storeConfig, STORE_DOMAIN, CALLBACK_SECRET, paymentState, emitAlert } = ctx;
  const router = express.Router();

  // supabase-js query builders are thenables without .catch(); await them inside try instead.
  async function dbSafe(label, ref, query) {
    try {
      const { data, error } = await query;
      if (error) StoreLog.error('db_failed', ref, `${label}: ${error.message}`);
      return data;
    } catch (err) {
      StoreLog.error('db_failed', ref, `${label}: ${err.message}`);
      return null;
    }
  }

  // subscriptions.status has a CHECK constraint: active|canceled|past_due|incomplete|unpaid|paused.
  // A trial (upsell before its first charge) counts as active; test mode lives in metadata.livemode.
  function dbSubStatus(stripeStatus) {
    const map = { trialing: 'active', incomplete_expired: 'canceled' };
    const s = map[stripeStatus] || stripeStatus;
    return ['active', 'canceled', 'past_due', 'incomplete', 'unpaid', 'paused'].includes(s) ? s : 'incomplete';
  }

  // Newer Stripe API versions moved invoice.subscription under invoice.parent.
  function invoiceSubscription(invoice) {
    const viaParent = invoice.parent && invoice.parent.subscription_details;
    return {
      id: invoice.subscription || (viaParent && viaParent.subscription) || null,
      metadata: (invoice.subscription_details && invoice.subscription_details.metadata) || (viaParent && viaParent.metadata) || {},
    };
  }

  router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe) {
      return res.status(404).json({ error: 'Stripe not configured' });
    }

    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!endpointSecret) {
      return res.status(200).json({ received: true });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      StoreLog.error('webhook_error', '---', `Signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const obj = event.data.object || {};
    const ref = obj.metadata?.campaign || obj.metadata?.basket_ref || obj.id?.substring(0, 12) || '---';

    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          StoreLog.event('webhook_ok', ref, `Payment succeeded ${obj.id} - ${fromSmallestUnit(obj.amount, obj.currency)} ${obj.currency.toUpperCase()}`);
          break;
        }
        case 'payment_intent.payment_failed': {
          StoreLog.error('webhook_fail', ref, `Payment failed ${obj.id} - ${obj.last_payment_error?.message || 'unknown'}`);
          if (supabase) {
            await dbSafe('payment_failures insert', ref, supabase.from('payment_failures').insert({
              store_id: ctx.getStoreDbId(),
              endpoint: 'webhook',
              stripe_payment_intent_id: obj.id,
              error_type: 'PAYMENT_FAILED',
              error_code: obj.last_payment_error?.decline_code || obj.last_payment_error?.code || 'UNKNOWN',
              error_message: obj.last_payment_error?.message || 'Payment failed',
              request_amount: fromSmallestUnit(obj.amount, obj.currency)
            }));
          }
          break;
        }
        case 'charge.dispute.created': {
          StoreLog.error('webhook_dispute', ref, `DISPUTE ${obj.id} - ${fromSmallestUnit(obj.amount, obj.currency)} ${obj.currency} - ${obj.reason}`);
          if (emitAlert) {
            emitAlert({ key: `dispute-${obj.id}`, title: `Stripe dispute: ${obj.reason}`, severity: 'critical',
              context: { dispute: obj.id, amount: fromSmallestUnit(obj.amount, obj.currency), currency: obj.currency, charge: obj.charge } });
          }
          break;
        }
        case 'charge.refunded': {
          StoreLog.event('webhook_refund', ref, `Refund ${obj.id} - ${fromSmallestUnit(obj.amount_refunded, obj.currency)} ${obj.currency}`);
          break;
        }
        case 'invoice.payment_succeeded':
        case 'invoice.paid': {
          const sub = invoiceSubscription(obj);
          // subscription_cycle = monthly renewals, including the first charge after the upsell's 30-day trial.
          if (!sub.id || obj.billing_reason !== 'subscription_cycle' || !(obj.amount_paid > 0)) break;
          const amt = fromSmallestUnit(obj.amount_paid, obj.currency);
          StoreLog.event('subscription_renewal', ref, `Recurring payment ${obj.id} - ${amt} ${obj.currency.toUpperCase()} (sub: ${sub.id})`);
          if (!supabase) break;

          const existingSub = await dbSafe('subscriptions select', ref, supabase.from('subscriptions')
            .select('source_ref, renewal_count, total_collected, customer_id, customer_email, customer_name')
            .eq('stripe_subscription_id', sub.id).maybeSingle());

          // Charge id + Stripe fee for the renewal (field names differ across API versions).
          let chargeId = obj.charge || null;
          let piId = obj.payment_intent || null;
          let fee = 0;
          try {
            if (!chargeId && piId) chargeId = (await stripe.paymentIntents.retrieve(piId)).latest_charge;
            if (chargeId) {
              const ch = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
              piId = piId || ch.payment_intent;
              const bt = ch.balance_transaction;
              if (bt && typeof bt === 'object') {
                const feeSettle = fromSmallestUnit(bt.fee, bt.currency);
                fee = bt.exchange_rate ? feeSettle / bt.exchange_rate : feeSettle;
              }
            }
          } catch (feeErr) {
            StoreLog.error('subscription_renewal', ref, `fee lookup: ${feeErr.message}`);
          }

          // Stripe retries webhooks; one payments row per renewal payment.
          const dupe = piId ? await dbSafe('payments dedupe', ref, supabase.from('payments').select('id').eq('stripe_payment_intent_id', piId).maybeSingle()) : null;
          if (!dupe) {
            await dbSafe('renewal insert', ref, supabase.from('payments').insert({
              store_id: ctx.getStoreDbId(),
              store_domain: STORE_DOMAIN,
              customer_id: existingSub?.customer_id || null,
              source_ref: sub.metadata.campaign || existingSub?.source_ref || 'subscription',
              payment_method: 'stripe',
              stripe_payment_intent_id: piId,
              stripe_charge_id: chargeId,
              stripe_subscription_id: sub.id,
              amount: amt,
              service_fee: 0,
              total_amount: amt,
              stripe_fee: fee,
              net_amount: amt - fee,
              currency: obj.currency.toUpperCase(),
              payment_source: 'subscription',
              customer_email: existingSub?.customer_email || obj.customer_email || null,
              billing_name: existingSub?.customer_name || obj.customer_name || null,
              status: obj.livemode ? 'completed' : 'test'
            }));
          }

          if (existingSub && !dupe) { // retried events must not count a renewal twice
            await dbSafe('subscriptions renewal update', ref, supabase.from('subscriptions')
              .update({
                renewal_count: (existingSub.renewal_count || 0) + 1,
                total_collected: parseFloat(existingSub.total_collected || 0) + amt,
                status: 'active',
                updated_at: new Date().toISOString()
              })
              .eq('stripe_subscription_id', sub.id));
          }
          break;
        }
        case 'invoice.payment_failed': {
          const sub = invoiceSubscription(obj);
          StoreLog.error('subscription_payment_failed', ref, `${obj.id} (sub: ${sub.id || '-'}) attempt ${obj.attempt_count || 1}`);
          if (supabase && sub.id) {
            await dbSafe('subscriptions past_due', ref, supabase.from('subscriptions')
              .update({ status: 'past_due', updated_at: new Date().toISOString() })
              .eq('stripe_subscription_id', sub.id));
          }
          break;
        }
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const status = event.type === 'customer.subscription.deleted' ? 'canceled' : obj.status;
          StoreLog.event('subscription_status', ref, `Subscription ${obj.id} → ${status}`);
          if (supabase) {
            const patch = { status: dbSubStatus(status), updated_at: new Date().toISOString() };
            if (status === 'canceled') patch.canceled_at = new Date().toISOString();
            if (obj.current_period_end) patch.current_period_end = new Date(obj.current_period_end * 1000).toISOString();
            await dbSafe('subscriptions status', ref, supabase.from('subscriptions').update(patch).eq('stripe_subscription_id', obj.id));
          }
          break;
        }
      }
    } catch (err) {
      // Log and still acknowledge: a 500 would make Stripe retry an event we can't process anyway.
      StoreLog.error('webhook_error', ref, `${event.type}: ${err.message}`);
    }

    res.status(200).json({ received: true });
  });

  router.post('/api/create-payment', async (req, res) => {
    try {
      if (!stripe) {
        return res.status(400).json({ error: 'Stripe not configured for this store', errorClass: 'operator', errorCode: 'not_configured' });
      }

      const sessionCookie = req.cookies.__session;
      if (!sessionCookie) {
        return res.status(400).json({ error: 'No session found', errorClass: 'donor_session', errorCode: 'no_session' });
      }

      const donor = JSON.parse(sessionCookie);
      const donorLang = donor.lang || 'en';

      const failFast = paymentState && paymentState.getFailFast();
      if (failFast && failFast.class === 'operator') {
        StoreLog.error('payment_failed', donor.ref || '---', `FAIL_FAST short-circuit: ${failFast.code} (${failFast.secondsRemaining}s remaining)`);
        return res.status(503).json({
          error: getDonorMessage('operator', donorLang),
          errorClass: 'operator',
          errorCode: failFast.code,
          retryAfterSeconds: failFast.secondsRemaining
        });
      }
      const clientTip = req.body && req.body.tip != null && !isNaN(parseFloat(req.body.tip)) && parseFloat(req.body.tip) >= 0
        ? parseFloat(req.body.tip)
        : parseFloat(donor.fee || 0);

      const totalAmount = parseFloat(donor.amount) + clientTip;
      const donorCurrency = donor.currency || 'EUR';
      const amountInUnits = toSmallestUnit(totalAmount, donorCurrency);
      const lineItems = decomposeAmount(totalAmount, storeConfig.products, donorCurrency);

      const refCode = (donor.sid || '').substring(0, 4).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const mk = storeConfig.metadataKeys || {};

      const metadata = {
        [mk.storeId || 'storeId']: ctx.getStoreDbId() || '',
        [mk.storeDomain || 'storeDomain']: STORE_DOMAIN,
        [mk.referenceCode || 'referenceCode']: refCode,
        [mk.sessionRef || 'sessionRef']: (donor.sid || '').substring(0, 12),
        [mk.subtotal || 'subtotal']: String(donor.amount),
        [mk.serviceFee || 'serviceFee']: String(clientTip),
        [mk.guestCheckout || 'guestCheckout']: String(donor.guest || false),
        [mk.orderSummary || 'orderSummary']: lineItems.map(i => `${i.quantity}x ${i.name}`).join(', ')
      };

      const stripeLineItems = lineItems.map(item => ({
        product_name: item.name.substring(0, 26),
        product_code: (item.slug || 'item').substring(0, 12).toUpperCase().replace(/-/g, ''),
        quantity: item.quantity,
        unit_cost: toSmallestUnit(item.price, donorCurrency),
        unit_of_measure: 'ACT',
        tax: { total_tax_amount: 0 }
      }));

      const cadence = String(donor.utm?.cadence || '').toLowerCase();
      const isSubscription = cadence === 'monthly' || cadence === 'subscription';

      if (isSubscription) {
        const email = donor.email || null;
        let customer;
        if (email) {
          const existing = await stripe.customers.list({ email, limit: 1 });
          customer = existing.data.length > 0
            ? existing.data[0]
            : await stripe.customers.create({ email, metadata: { [mk.sessionRef || 'sessionRef']: (donor.sid || '').substring(0, 12) } });
        } else {
          customer = await stripe.customers.create({ metadata: { [mk.sessionRef || 'sessionRef']: (donor.sid || '').substring(0, 12) } });
        }

        const product = await stripe.products.create({
          name: lineItems.map(i => `${i.quantity}x ${i.name}`).join(', '),
          metadata: { [mk.storeId || 'storeId']: ctx.getStoreDbId() || '', type: 'donation_subscription' }
        });

        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: amountInUnits,
          currency: donorCurrency.toLowerCase(),
          recurring: { interval: 'month' }
        });

        const subscription = await stripe.subscriptions.create({
          customer: customer.id,
          items: [{ price: price.id }],
          payment_behavior: 'default_incomplete',
          payment_settings: {
            save_default_payment_method: 'on_subscription'
          },
          metadata: {
            ...metadata,
            [mk.referenceCode || 'referenceCode']: refCode,
            cadence: 'monthly'
          },
          expand: ['latest_invoice.confirmation_secret']
        });

        const invoice = subscription.latest_invoice;
        const clientSecret = invoice?.confirmation_secret?.client_secret;

        if (!clientSecret) {
          StoreLog.error('subscription_error', donor.ref || '---', `Sub ${subscription.id} has no confirmation_secret (inv: ${invoice?.id || 'null'}, status: ${invoice?.status || 'null'})`);
          await stripe.subscriptions.cancel(subscription.id).catch(() => {});
          return res.status(500).json({ error: 'Subscription setup failed', errorClass: 'operator' });
        }

        StoreLog.event('subscription_created', donor.ref || '---', `${subscription.id} / inv:${invoice.id} - ${fmtAmount(totalAmount, donor.currency)} ${donor.currency}/mo`);

        res.json({
          clientSecret,
          subscriptionId: subscription.id,
          invoiceId: invoice.id,
          amount: totalAmount.toFixed(2),
          lineItems,
          isSubscription: true
        });
      } else {
        // Save the card (setup_future_usage) so the thank-you screen can offer a one-tap monthly gift.
        // Must match the Payment Element's setupFutureUsage option in public/js/checkout.js.
        const payerEmail = String(req.body?.email || donor.email || '').trim() || undefined;
        const payerName = String(req.body?.name || '').trim() || undefined;
        let customerId = null;
        try {
          const customer = await stripe.customers.create({
            email: payerEmail, name: payerName,
            metadata: { [mk.sessionRef || 'sessionRef']: (donor.sid || '').substring(0, 12) }
          });
          customerId = customer.id;
        } catch (custErr) {
          StoreLog.error('payment_created', donor.ref || '---', `customer create (non-critical): ${custErr.message}`);
        }

        const intentParams = {
          amount: amountInUnits,
          currency: donorCurrency.toLowerCase(),
          metadata,
          description: lineItems.map(i => `${i.quantity}x ${i.name}`).join(', '),
          statement_descriptor_suffix: storeConfig.statementDescriptor.substring(0, 22),
          payment_details: { order_reference: refCode },
          amount_details: { line_items: stripeLineItems },
          setup_future_usage: 'off_session',
          ...(customerId ? { customer: customerId } : {})
        };

        let paymentIntent;
        try {
          paymentIntent = await stripe.paymentIntents.create({
            ...intentParams,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' }
          });
        } catch (autoErr) {
          if (autoErr.message?.includes('payment method types') || autoErr.message?.includes('capabilities')) {
            paymentIntent = await stripe.paymentIntents.create({
              ...intentParams,
              payment_method_types: ['card']
            });
          } else {
            throw autoErr;
          }
        }

        StoreLog.event('payment_created', donor.ref || '---', `${paymentIntent.id.substring(0, 18)}... - ${fmtAmount(totalAmount, donor.currency)} ${donor.currency}`);

        res.json({
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount: totalAmount.toFixed(2),
          lineItems,
          isSubscription: false
        });
      }
    } catch (error) {
      const sessionCookie = req.cookies.__session;
      const donor = (() => { try { return sessionCookie ? JSON.parse(sessionCookie) : {}; } catch (_) { return {}; } })();
      const donorLang = donor.lang || 'en';
      const ref = donor.ref || '---';
      const cls = classifyStripeError(error);

      StoreLog.error('payment_failed', ref, `${cls.code} (${cls.type}/${cls.class}): ${error.message}`);

      if (cls.operatorActionable && paymentState) {
        paymentState.tripFailFast({
          errClass: cls.class,
          code: cls.code,
          message: error.message,
          ttlMs: 60 * 1000
        });
        if (emitAlert) {
          emitAlert({
            key: `stripe-${cls.code}`,
            title: `Stripe ${cls.type}: ${cls.code}`,
            severity: 'critical',
            context: {
              code: cls.code,
              type: cls.type,
              message: error.message,
              donorRef: ref,
              donorAmount: donor.amount,
              hint: cls.code === 'api_key_expired' || cls.code === 'api_key_invalid'
                ? 'Roll a new sk_live_* key in Stripe dashboard and update STRIPE_SECRET_KEY env var. Donations are blocked until fixed.'
                : 'Investigate Stripe account status and key permissions.'
            }
          });
        }
      }

      if (supabase) {
        await supabase.from('payment_failures').insert({
          store_id: ctx.getStoreDbId(),
          source_ref: donor.ref,
          endpoint: '/api/create-payment',
          error_type: cls.type,
          error_code: cls.code,
          error_message: error.message,
          request_amount: donor.amount,
          ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
        }).then(({ error: insErr }) => {
          if (insErr) console.error('[stripe] payment_failures insert failed:', insErr.message);
        }).catch(() => {});
      }

      const statusCode = cls.class === 'operator' ? 503 : (cls.class === 'rate_limit' ? 429 : 500);
      res.status(statusCode).json({
        error: getDonorMessage(cls.class, donorLang),
        errorClass: cls.class,
        errorCode: cls.code,
        retryable: cls.retryable
      });
    }
  });

  router.post('/api/confirm-payment', async (req, res) => {
    try {
      if (!stripe) {
        return res.status(400).json({ error: 'Stripe not configured for this store' });
      }

      let { paymentIntentId, isSubscription, subscriptionId } = req.body;
      const sessionCookie = req.cookies.__session;
      if (!sessionCookie) {
        return res.status(400).json({ error: 'Missing session' });
      }

      if (!paymentIntentId && subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
        const invoiceId = typeof sub.latest_invoice === 'string' ? sub.latest_invoice : sub.latest_invoice?.id;
        if (invoiceId) {
          const inv = await stripe.invoices.retrieve(invoiceId, { expand: ['payments.data.payment.payment_intent'] });
          paymentIntentId = inv.payments?.data?.[0]?.payment?.payment_intent?.id || null;
        }
      }

      if (!paymentIntentId) {
        return res.status(400).json({ error: 'Missing payment data' });
      }

      const donor = JSON.parse(sessionCookie);

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['payment_method', 'latest_charge.balance_transaction']
      });

      if (paymentIntent.status !== 'succeeded') {
        StoreLog.error('confirm_failed', donor.ref || '---', `Payment status: ${paymentIntent.status}`);
        return res.status(400).json({ error: `Payment ${paymentIntent.status}` });
      }

      const charge = paymentIntent.latest_charge;
      const pm = paymentIntent.payment_method;

      let stripeFee = 0;
      let resolvedBt = null;
      const bt = charge?.balance_transaction;
      if (bt && typeof bt === 'object') {
        resolvedBt = bt;
      } else if (charge?.id) {
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          try {
            const freshCharge = await stripe.charges.retrieve(charge.id, {
              expand: ['balance_transaction']
            });
            if (freshCharge.balance_transaction && typeof freshCharge.balance_transaction === 'object') {
              resolvedBt = freshCharge.balance_transaction;
              break;
            }
          } catch (btErr) {
            console.error(`Retry ${attempt + 1}/3 fetching balance_transaction:`, btErr.message);
          }
        }
      }
      if (resolvedBt) {
        const feeInSettlement = fromSmallestUnit(resolvedBt.fee, resolvedBt.currency);
        stripeFee = resolvedBt.exchange_rate ? feeInSettlement / resolvedBt.exchange_rate : feeInSettlement;
      }

      const totalAmount = fromSmallestUnit(paymentIntent.amount, paymentIntent.currency);

      let cardHolderName = pm?.billing_details?.name || '';
      let cardLastDigits = pm?.card?.last4 || null;
      let cardBrand = pm?.card?.brand || null;
      let cardExpiry = pm?.card ? `${String(pm.card.exp_month).padStart(2, '0')}/${pm.card.exp_year}` : null;
      let cardType = pm?.card?.funding || null;
      let paymentSource = 'card';
      if (pm?.card?.wallet?.type === 'apple_pay') paymentSource = 'apple_pay';
      if (pm?.card?.wallet?.type === 'google_pay') paymentSource = 'google_pay';
      if (pm?.type === 'link') paymentSource = 'link';

      const brandDisplay = cardBrand ? cardBrand.charAt(0).toUpperCase() + cardBrand.slice(1) : 'Card';
      StoreLog.event('payment_ok', donor.ref || '---', `${fmtAmount(totalAmount, donor.currency)} ${donor.currency} via ${brandDisplay} ****${cardLastDigits || '????'} (${cardHolderName || 'anonymous'})`);

      let donorName = cardHolderName || 'Anonymous';
      if (donor.guest) donorName = 'Anonymous';

      const donorNameReal = cardHolderName || 'Unknown';
      if (!donor.guest && donorNameReal !== 'Unknown') {
        const parts = donorNameReal.trim().split(/\s+/);
        donorName = parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : donorNameReal;
      }

      const mk = storeConfig.metadataKeys || {};
      const savedTip = parseFloat(
        paymentIntent.metadata?.[mk.serviceFee || 'serviceFee'] ?? donor.fee ?? 0
      );
      const lineItems = decomposeAmount(parseFloat(donor.amount) + savedTip, storeConfig.products, donor.currency || 'EUR');

      let customerId = null;
      const email = donor.email || charge?.billing_details?.email || null;

      let stripeCustomerId = typeof paymentIntent.customer === 'string'
        ? paymentIntent.customer
        : (paymentIntent.customer && paymentIntent.customer.id) || null;
      if (!stripeCustomerId && email) {
        try {
          const existingCustomers = await stripe.customers.list({ email, limit: 1 });
          if (existingCustomers.data.length > 0) {
            stripeCustomerId = existingCustomers.data[0].id;
          } else {
            const newStripeCustomer = await stripe.customers.create({ email, name: cardHolderName || undefined });
            stripeCustomerId = newStripeCustomer.id;
          }
          if (!isSubscription) {
            await stripe.paymentIntents.update(paymentIntentId, { customer: stripeCustomerId });
          }
        } catch (custErr) {
          StoreLog.error('confirm_failed', donor.ref || '---', `Stripe customer attach (non-critical): ${custErr.message}`);
        }
      }

      if (email) {
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (existingCustomer) {
          customerId = existingCustomer.id;
          StoreLog.event('customer_exists', donor.ref || '---', `${email} (returning)`);
        } else {
          const initials = donorNameReal !== 'Unknown'
            ? donorNameReal.trim().split(/\s+/).map(p => p[0]).join('').substring(0, 2).toUpperCase()
            : '?';

          const nowIso = new Date().toISOString();
          const { data: newCustomer, error: custInsertErr } = await supabase
            .from('customers')
            .insert({
              name: donorName, initials, email,
              card_holder_name: cardHolderName || null,
              first_donation_at: nowIso,
              last_donation_at: nowIso,
              country: charge?.billing_details?.address?.country || null,
              color_gradient: ['from-blue-400 to-blue-500', 'from-violet-400 to-violet-500', 'from-rose-400 to-rose-500', 'from-emerald-400 to-emerald-500'][Math.floor(Math.random() * 4)],
              utm_source: donor.utm?.utm_source || null,
              utm_medium: donor.utm?.utm_medium || null,
              utm_campaign: donor.utm?.utm_campaign || null,
              referrer_url: donor.utm?.referrer || null
            })
            .select()
            .single();

          if (custInsertErr) {
            StoreLog.error('customer_insert_failed', donor.ref || '---', `${email}: ${custInsertErr.message}`);
          }
          customerId = newCustomer?.id || null;
          StoreLog.event('customer_new', donor.ref || '---', `${email} (${stripeCustomerId || 'no-stripe'}${customerId ? '' : ' UNLINKED'})`);
        }
      }

      await supabase
        .from('payments')
        .insert({
          customer_id: customerId,
          store_id: ctx.getStoreDbId(),
          store_domain: STORE_DOMAIN,
          source_ref: donor.ref,
          payment_method: 'stripe',
          stripe_payment_intent_id: paymentIntent.id,
          stripe_charge_id: charge?.id,
          amount: parseFloat(donor.amount),
          service_fee: savedTip,
          total_amount: totalAmount,
          stripe_fee: stripeFee,
          net_amount: totalAmount - stripeFee,
          currency: donor.currency,
          payment_source: paymentSource,
          status: paymentIntent.livemode ? 'completed' : 'test',
          line_items: lineItems,
          customer_name: donorName,
          billing_name: donorNameReal,
          guest_checkout: donor.guest || false,
          card_holder_name: cardHolderName || null,
          card_last_digits: cardLastDigits,
          card_brand: cardBrand,
          card_expiry: cardExpiry,
          card_type: cardType,
          customer_email: email,
          ip_address: donor.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
          user_agent: donor.ua || req.headers['user-agent'],
          fbp: donor.utm?.fbp || null, fbc: donor.utm?.fbc || null, fbclid: donor.utm?.fbclid || null,
          ttp: donor.utm?.ttp || null, ttclid: donor.utm?.ttclid || null,
          utm_source: donor.utm?.utm_source || null, utm_medium: donor.utm?.utm_medium || null,
          utm_campaign: donor.utm?.utm_campaign || null, utm_content: donor.utm?.utm_content || null,
          utm_term: donor.utm?.utm_term || null,
          referrer_url: donor.utm?.referrer || null,
          landing_url: donor.utm?.sourceUrl || null,
          stripe_subscription_id: subscriptionId || null,
          stripe_response: {
            paymentIntentId: paymentIntent.id, chargeId: charge?.id,
            status: paymentIntent.status, amount: paymentIntent.amount,
            currency: paymentIntent.currency, cardBrand, cardLast4: cardLastDigits,
            walletType: pm?.card?.wallet?.type || null,
            isSubscription: isSubscription || false,
            subscriptionId: subscriptionId || null
          }
        });

      if (isSubscription && subscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await supabase.from('subscriptions').insert({
            customer_id: customerId,
            store_id: ctx.getStoreDbId(),
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: sub.customer,
            stripe_price_id: sub.items?.data?.[0]?.price?.id || null,
            stripe_product_id: sub.items?.data?.[0]?.price?.product || null,
            source_ref: donor.ref,
            amount: totalAmount,
            currency: donor.currency,
            interval: 'month',
            status: sub.status,
            current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
            current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
            renewal_count: 0,
            total_collected: totalAmount,
            customer_email: email,
            customer_name: donorNameReal,
            metadata: { ref: donor.ref, sid: donor.sid }
          });
          StoreLog.event('subscription_saved', donor.ref || '---', `${subscriptionId} → DB`);
        } catch (subErr) {
          StoreLog.error('subscription_save_failed', donor.ref || '---', subErr.message);
        }
      }

      const fmk = storeConfig.metadataKeys || {};
      if (email) {
        const refKeyName = fmk.referenceCode || 'referenceCode';
        const donationReference = (paymentIntent.metadata && paymentIntent.metadata[refKeyName]) || paymentIntent.id.slice(-8).toUpperCase();
        const savedTip = parseFloat(paymentIntent.metadata?.[fmk.serviceFee || 'serviceFee'] || donor.fee || 0);
        sendDonationConfirmation({
          to: email,
          name: donorNameReal !== 'Unknown' ? donorNameReal : '',
          currency: donor.currency,
          donationAmount: parseFloat(donor.amount),
          tip: savedTip,
          total: totalAmount,
          cardBrand,
          cardLast4: cardLastDigits,
          paymentSource,
          reference: donationReference,
          descriptor: storeConfig.statementDescriptor,
          paymentIntentId: paymentIntent.id,
          emailTemplate: donor.utm?.emailTemplate || 'default'
        });
      }

      const fulfillment = storeConfig.fulfillment || {};
      const fulfillmentStatusValue = fulfillment.statusValue || 'delivered';
      const deliveryMethodValue = fulfillment.method || 'digital_download';
      await stripe.paymentIntents.update(paymentIntent.id, {
        metadata: {
          ...paymentIntent.metadata,
          [fmk.fulfillmentStatus || 'fulfillment_status']: fulfillmentStatusValue,
          [fmk.fulfilledAt || 'fulfilled_at']: new Date().toISOString(),
          [fmk.deliveryMethod || 'delivery_method']: deliveryMethodValue
        }
      });

      const campaignUrl = resolveCampaignCallbackUrl(donor, donor.ref);
      if (campaignUrl) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          await fetch(`${campaignUrl}/api/payment-callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              secret: CALLBACK_SECRET,
              tokenId: donor.sid,
              paymentData: {
                amount: parseFloat(donor.amount), tip: savedTip, totalAmount, currency: donor.currency,
                storeDomain: STORE_DOMAIN, stripeChargeId: charge?.id,
                cardHolderName, donorNameReal, donorEmail: email,
                customerId, ipAddress: donor.ip, userAgent: donor.ua,
                tracking: donor.utm || {}
              }
            })
          }).finally(() => clearTimeout(timeout));
          StoreLog.event('callback_sent', donor.ref || '---', `→ ${extractOriginHost(campaignUrl)}/api/payment-callback`);
        } catch (callbackErr) {
          StoreLog.error('callback_failed', donor.ref || '---', `→ ${extractOriginHost(campaignUrl)}: ${callbackErr.message}`);
        }
      } else {
        StoreLog.error('callback_failed', donor.ref || '---', 'no campaign route for payment-callback');
      }

      res.clearCookie('__session', { path: '/' });

      let campaignOrigin = '';
      try {
        const srcUrl = (donor.utm && donor.utm.sourceUrl) ? donor.utm.sourceUrl : '';
        if (srcUrl) campaignOrigin = new URL(srcUrl).origin;
      } catch (_) {}
      if (!campaignOrigin) campaignOrigin = campaignUrl || '';
      const eidParam = donor.utm?.eventId ? `&eid=${encodeURIComponent(donor.utm.eventId)}` : '';
      // Purchase value for Meta = what the donor paid (donation + tip)
      const amtParam = totalAmount ? `&amt=${encodeURIComponent(totalAmount)}` : '';
      const curParam = donor.currency ? `&cur=${encodeURIComponent(donor.currency)}` : '';
      const redirectUrl = campaignOrigin ? `${campaignOrigin}?status=complete${eidParam}${amtParam}${curParam}` : '/';

      StoreLog.event('redirect', donor.ref || '---', `→ ${redirectUrl}`);

      // Post-donation monthly upsell: only for one-time card/wallet payments whose card was saved.
      let upsellOffer = null;
      const pmId = pm && pm.id;
      const reusable = pmId && (pm.type === 'card' || pm.type === 'link') && paymentIntent.setup_future_usage === 'off_session';
      if (!isSubscription && reusable && stripeCustomerId) {
        const t = donor.utm || {};
        res.cookie('__upsell', upsell.makeOfferToken({
          pi: paymentIntent.id, pm: pmId, cus: stripeCustomerId,
          ref: donor.ref, sid: donor.sid, cur: donor.currency || 'EUR', don: parseFloat(donor.amount),
          email, name: donorNameReal !== 'Unknown' ? donorNameReal : '', lang: donor.lang || 'en',
          ip: donor.ip, ua: donor.ua, live: paymentIntent.livemode,
          trk: { sourceUrl: t.sourceUrl || null, fbp: t.fbp || null, fbc: t.fbc || null, fbclid: t.fbclid || null,
                 ttp: t.ttp || null, ttclid: t.ttclid || null, clientLocation: t.clientLocation || null, campaignOrigin: t.campaignOrigin || null }
        }), { httpOnly: true, secure: req.secure || req.headers['x-forwarded-proto'] === 'https', sameSite: 'lax', maxAge: 30 * 60 * 1000, path: '/' });
        upsellOffer = {
          amounts: upsell.suggestAmounts(parseFloat(donor.amount)),
          currency: donor.currency || 'EUR',
          firstCharge: upsell.firstChargeDate().toISOString(),
          donation: parseFloat(donor.amount),
          donorFirstName: donorNameReal !== 'Unknown' ? donorNameReal.trim().split(/\s+/)[0] : ''
        };
      }

      res.json({ success: true, redirectUrl, sessionId: donor.sid || null, upsell: upsellOffer });
    } catch (error) {
      const ref = (() => { try { return JSON.parse(req.cookies.__session)?.ref; } catch (_) { return '---'; } })();
      StoreLog.error('confirm_failed', ref, `${error.code || 'ERROR'}: ${error.message}`);

      try {
        const sessionCookie = req.cookies.__session;
        const donor = sessionCookie ? JSON.parse(sessionCookie) : {};
        await supabase.from('payment_failures').insert({
          store_id: ctx.getStoreDbId(), source_ref: donor.ref,
          endpoint: '/api/confirm-payment',
          stripe_payment_intent_id: req.body?.paymentIntentId,
          error_type: 'CONFIRM_ERROR', error_code: error.code || 'UNKNOWN',
          error_message: error.message,
          ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
        });
      } catch (logErr) {}

      res.status(500).json({ error: 'Failed to confirm payment' });
    }
  });

  router.post('/api/store-checkout', async (req, res) => {
    try {
      if (!stripe) {
        return res.status(400).json({ error: 'Stripe not configured for this store' });
      }

      const { items } = req.body;
      if (!items || !items.length) {
        return res.status(400).json({ error: 'Cart is empty' });
      }

      const products = storeConfig.products || [];
      let total = 0;
      const validItems = [];

      for (const item of items) {
        const product = products.find(p => p.slug === item.slug);
        if (product) {
          const qty = Math.max(1, Math.min(10, parseInt(item.quantity) || 1));
          total += product.price * qty;
          validItems.push({ name: product.name, slug: product.slug, price: product.price, quantity: qty });
        }
      }

      if (total < 1) {
        return res.status(400).json({ error: 'Invalid cart total' });
      }

      const storeCurrency = storeConfig.currency || 'GBP';
      const amountInUnits = toSmallestUnit(total, storeCurrency);
      const mk = storeConfig.metadataKeys || {};
      const refCode = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

      const intentParams = {
        amount: amountInUnits,
        currency: storeCurrency.toLowerCase(),
        metadata: {
          [mk.storeId || 'storeId']: ctx.getStoreDbId() || '',
          [mk.storeDomain || 'storeDomain']: STORE_DOMAIN,
          [mk.referenceCode || 'referenceCode']: refCode,
          [mk.orderSummary || 'orderSummary']: validItems.map(i => `${i.quantity}x ${i.name}`).join(', ')
        },
        description: validItems.map(i => `${i.quantity}x ${i.name}`).join(', '),
        statement_descriptor_suffix: storeConfig.statementDescriptor.substring(0, 22),
        payment_details: { order_reference: refCode },
        amount_details: {
          line_items: validItems.map(item => ({
            product_name: item.name.substring(0, 26),
            product_code: (item.slug || 'item').substring(0, 12).toUpperCase().replace(/-/g, ''),
            quantity: item.quantity,
            unit_cost: toSmallestUnit(item.price, storeCurrency),
            unit_of_measure: 'ACT',
            tax: { total_tax_amount: 0 }
          }))
        }
      };

      let paymentIntent;
      try {
        paymentIntent = await stripe.paymentIntents.create({
          ...intentParams,
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' }
        });
      } catch (autoErr) {
        if (autoErr.message?.includes('payment method types') || autoErr.message?.includes('capabilities')) {
          paymentIntent = await stripe.paymentIntents.create({
            ...intentParams,
            payment_method_types: ['card']
          });
        } else {
          throw autoErr;
        }
      }

      const storeDecimals = getDecimals(storeCurrency);
      StoreLog.event('store_checkout', refCode, `${paymentIntent.id.substring(0, 18)}... - ${formatAmount(total, storeCurrency)} - ${validItems.map(i => `${i.quantity}x ${i.name}`).join(', ')}`);

      res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id, amount: total.toFixed(storeDecimals) });
    } catch (error) {
      StoreLog.error('store_checkout', '---', `${error.code || 'ERROR'}: ${error.message}`);
      res.status(500).json({ error: 'Payment setup failed' });
    }
  });

  // One-tap monthly gift after a one-time donation. Reads the signed __upsell cookie set by
  // /api/confirm-payment (valid 30 min, single use) — the body only carries the chosen amount.
  async function subscribeUpsell(req, res) {
    const offer = upsell.readOfferToken(req.cookies.__upsell);
    if (!stripe || !offer) {
      return res.status(410).json({ success: false, error: 'offer_expired' });
    }
    const ref = offer.ref || '---';
    const monthly = Math.round(Number(req.body?.monthlyAmount) * 100) / 100;
    if (!Number.isFinite(monthly) || monthly < 1 || monthly > 1000) {
      return res.status(400).json({ success: false, error: 'invalid_amount' });
    }

    try {
      const productId = await upsell.getMonthlyProduct(stripe, storeConfig);
      const pmObj = await stripe.paymentMethods.retrieve(offer.pm);
      if (!pmObj.customer) await stripe.paymentMethods.attach(offer.pm, { customer: offer.cus });

      const firstCharge = upsell.firstChargeDate();
      const subscription = await stripe.subscriptions.create({
        customer: offer.cus,
        items: [{ price_data: {
          currency: offer.cur.toLowerCase(),
          product: productId,
          unit_amount: toSmallestUnit(monthly, offer.cur),
          recurring: { interval: 'month' }
        } }],
        default_payment_method: offer.pm,
        trial_end: Math.floor(firstCharge.getTime() / 1000), // first charge in 30 days, not today
        off_session: true,
        metadata: { campaign: offer.ref || '', lang: offer.lang || 'en', upsell: 'true', sessionRef: String(offer.sid || '').substring(0, 12), source_pi: offer.pi }
      }, { idempotencyKey: `upsell-${offer.pi}` });

      res.clearCookie('__upsell', { path: '/' });
      StoreLog.event('upsell_created', ref, `${subscription.id} - ${fmtAmount(monthly, offer.cur)} ${offer.cur}/mo, first charge ${firstCharge.toISOString().slice(0, 10)}`);

      if (supabase) {
        const { error: subErr } = await supabase.from('subscriptions').insert({
          store_id: ctx.getStoreDbId(),
          stripe_subscription_id: subscription.id,
          stripe_customer_id: offer.cus,
          stripe_price_id: subscription.items?.data?.[0]?.price?.id || null,
          stripe_product_id: productId,
          source_ref: offer.ref,
          amount: monthly,
          currency: offer.cur,
          interval: 'month',
          status: dbSubStatus(subscription.status),
          current_period_end: firstCharge.toISOString(),
          renewal_count: 0,
          total_collected: 0,
          customer_email: offer.email || null,
          customer_name: offer.name || null,
          metadata: { ref: offer.ref, sid: offer.sid, upsell: true, source_pi: offer.pi, first_charge_at: firstCharge.toISOString(), trial: subscription.status === 'trialing', livemode: subscription.livemode }
        });
        if (subErr) StoreLog.error('subscription_save_failed', ref, subErr.message);
      }

      const host = req.get('host') || STORE_DOMAIN;
      const proto = /^(localhost|127\.)/.test(host) ? 'http' : 'https';
      const manageUrl = `${proto}://${host}/donation/manage?s=${subscription.id}&t=${upsell.cancelToken(subscription.id)}`;
      if (offer.email) {
        sendSubscriptionConfirmation({
          to: offer.email, name: offer.name, lang: offer.lang, currency: offer.cur,
          monthly, firstCharge, manageUrl, subscriptionId: subscription.id
        });
      }

      // Meta/TikTok "Subscribe" (server-side) via the campaign that owns the pixel.
      const campaignUrl = resolveCampaignCallbackUrl({ utm: offer.trk }, offer.ref);
      if (campaignUrl) {
        fetch(`${campaignUrl}/api/subscription-callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
          body: JSON.stringify({
            secret: CALLBACK_SECRET,
            subscription: { id: subscription.id, monthly, currency: offer.cur, campaign: offer.ref, livemode: subscription.livemode },
            donor: { email: offer.email, name: offer.name, ipAddress: offer.ip, userAgent: offer.ua },
            tracking: offer.trk
          })
        }).then((r) => {
          if (!r.ok) StoreLog.error('callback_failed', ref, `subscription-callback HTTP ${r.status}`);
        }).catch((err) => StoreLog.error('callback_failed', ref, `subscription-callback: ${err.message}`));
      }

      res.json({ success: true, subscriptionId: subscription.id, monthly, currency: offer.cur, firstCharge: firstCharge.toISOString() });
    } catch (error) {
      StoreLog.error('upsell_failed', ref, `${error.code || 'ERROR'}: ${error.message}`);
      res.status(error.type === 'StripeCardError' ? 402 : 500).json({ success: false, error: 'subscription_failed' });
    }
  }

  router.post('/api/upsell/subscribe', subscribeUpsell);
  router.post('/api/create-subscription-upsell', subscribeUpsell); // legacy path used by checkout-donor-v2

  // Self-serve management page linked from the confirmation email (HMAC token, no login).
  function managePage(res, { title, body, lang }) {
    res.set('Cache-Control', 'no-store').send(`<!DOCTYPE html><html lang="${lang || 'en'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="robots" content="noindex"></head>
<body style="margin:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937">
<div style="max-width:440px;margin:0 auto;padding:40px 16px"><div style="background:#fff;border:1px solid #e8ebee;border-radius:16px;padding:28px 22px;text-align:center">
${body}</div></div></body></html>`);
  }

  function manageStrings(lang) {
    const l = (CHECKOUT_LOCALE[lang] || CHECKOUT_LOCALE.en).upsell || CHECKOUT_LOCALE.en.upsell;
    return l.manage;
  }

  router.get('/donation/manage', async (req, res) => {
    const { s, t } = req.query;
    if (!stripe || !s || !upsell.checkCancelToken(String(s), String(t || ''))) {
      return res.status(404).send('Not found');
    }
    try {
      const sub = await stripe.subscriptions.retrieve(String(s));
      const lang = sub.metadata?.lang || 'en';
      const m = manageStrings(lang);
      const amount = fmtAmount(fromSmallestUnit(sub.items.data[0].price.unit_amount, sub.currency), sub.currency.toUpperCase());
      if (sub.status === 'canceled') {
        return managePage(res, { title: m.title, lang, body: `<h1 style="font-size:20px;margin:0 0 8px">${m.alreadyCanceled}</h1><p style="color:#6b7280;font-size:14px;margin:0">${m.noMoreCharges}</p>` });
      }
      const next = new Date((sub.trial_end || sub.current_period_end) * 1000).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
      managePage(res, { title: m.title, lang, body: `
<h1 style="font-size:20px;margin:0 0 8px">${m.title}</h1>
<p style="color:#4b5563;font-size:15px;margin:0 0 4px"><strong>${amount}</strong> ${m.perMonth}</p>
<p style="color:#6b7280;font-size:13px;margin:0 0 22px">${m.nextCharge} ${next}</p>
<form method="post" action="/donation/manage">
<input type="hidden" name="s" value="${String(s).replace(/[^\w]/g, '')}"><input type="hidden" name="t" value="${String(t).replace(/[^\w-]/g, '')}">
<button style="width:100%;padding:14px;border:0;border-radius:12px;background:#dc2626;color:#fff;font-weight:700;font-size:15px;cursor:pointer">${m.cancelButton}</button>
</form>` });
    } catch (err) {
      StoreLog.error('subscription_manage', String(s).substring(0, 12), err.message);
      res.status(404).send('Not found');
    }
  });

  router.post('/donation/manage', express.urlencoded({ extended: false }), async (req, res) => {
    const s = String(req.body?.s || '');
    const t = String(req.body?.t || '');
    if (!stripe || !s || !upsell.checkCancelToken(s, t)) return res.status(404).send('Not found');
    try {
      const sub = await stripe.subscriptions.retrieve(s);
      const lang = sub.metadata?.lang || 'en';
      const m = manageStrings(lang);
      if (sub.status !== 'canceled') await stripe.subscriptions.cancel(s);
      StoreLog.event('subscription_cancelled', sub.metadata?.campaign || '---', `${s} cancelled by donor`);
      if (supabase) {
        await dbSafe('subscriptions cancel', s, supabase.from('subscriptions')
          .update({ status: 'canceled', canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', s));
      }
      managePage(res, { title: m.title, lang, body: `<h1 style="font-size:20px;margin:0 0 8px">${m.canceled}</h1><p style="color:#6b7280;font-size:14px;margin:0">${m.noMoreCharges}</p>` });
    } catch (err) {
      StoreLog.error('subscription_manage', s.substring(0, 12), err.message);
      res.status(500).send('Something went wrong. Please reply to your confirmation email and we will cancel it for you.');
    }
  });

  return router;
};
