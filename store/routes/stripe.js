const express = require('express');
const { decomposeAmount } = require('../lib/decompose');
const { toSmallestUnit, fromSmallestUnit, getDecimals, formatAmount } = require('../lib/currency');
const { StoreLog, fmtAmount, extractOriginHost } = require('../lib/logger');
const { resolveCampaignCallbackUrl } = require('../lib/campaign-routing');
const { classifyStripeError, getDonorMessage } = require('../lib/stripe-errors');
const { sendDonationConfirmation } = require('../lib/email');

module.exports = function createStripeRouter(ctx) {
  const { stripe, supabase, storeConfig, STORE_DOMAIN, CALLBACK_SECRET, paymentState, emitAlert } = ctx;
  const router = express.Router();

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

    const ref = event.data.object?.metadata?.basket_ref || event.data.object?.id?.substring(0, 12) || '---';

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        StoreLog.event('webhook_ok', ref, `Payment succeeded ${pi.id} - ${fromSmallestUnit(pi.amount, pi.currency)} ${pi.currency.toUpperCase()}`);
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        StoreLog.error('webhook_fail', ref, `Payment failed ${pi.id} - ${pi.last_payment_error?.message || 'unknown'}`);
        if (supabase) {
          await supabase.from('payment_failures').insert({
            store_id: ctx.getStoreDbId(),
            endpoint: 'webhook',
            stripe_payment_intent_id: pi.id,
            error_type: 'PAYMENT_FAILED',
            error_code: pi.last_payment_error?.code || 'UNKNOWN',
            error_message: pi.last_payment_error?.message || 'Payment failed',
            request_amount: fromSmallestUnit(pi.amount, pi.currency)
          }).catch(() => {});
        }
        break;
      }
      case 'charge.dispute.created': {
        const dispute = event.data.object;
        StoreLog.error('webhook_dispute', ref, `DISPUTE ${dispute.id} - ${fromSmallestUnit(dispute.amount, dispute.currency)} ${dispute.currency} - ${dispute.reason}`);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object;
        StoreLog.event('webhook_refund', ref, `Refund ${charge.id} - ${fromSmallestUnit(charge.amount_refunded, charge.currency)} ${charge.currency}`);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.billing_reason === 'subscription_cycle') {
          const subId = invoice.subscription;
          const amt = fromSmallestUnit(invoice.amount_paid, invoice.currency);
          StoreLog.event('subscription_renewal', ref, `Recurring payment ${invoice.id} - ${amt} ${invoice.currency.toUpperCase()} (sub: ${subId})`);
          if (supabase) {
            const subMeta = invoice.subscription_details?.metadata || {};
            const mk = storeConfig.metadataKeys || {};
            await supabase.from('payments').insert({
              store_id: ctx.getStoreDbId(),
              store_domain: STORE_DOMAIN,
              source_ref: subMeta[mk.sessionRef || 'sessionRef'] || 'subscription',
              payment_method: 'stripe',
              stripe_payment_intent_id: invoice.payment_intent,
              stripe_charge_id: invoice.charge,
              stripe_subscription_id: subId,
              amount: amt,
              service_fee: 0,
              total_amount: amt,
              currency: invoice.currency.toUpperCase(),
              payment_source: 'subscription',
              status: 'completed'
            }).catch(() => {});

            const { data: existingSub } = await supabase
              .from('subscriptions')
              .select('renewal_count, total_collected')
              .eq('stripe_subscription_id', subId)
              .maybeSingle();

            if (existingSub) {
              await supabase.from('subscriptions')
                .update({
                  renewal_count: (existingSub.renewal_count || 0) + 1,
                  total_collected: parseFloat(existingSub.total_collected || 0) + amt,
                  status: 'active',
                  updated_at: new Date().toISOString()
                })
                .eq('stripe_subscription_id', subId)
                .catch(() => {});
            }
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        StoreLog.event('subscription_cancelled', ref, `Subscription ${sub.id} cancelled (status: ${sub.status})`);
        if (supabase) {
          await supabase.from('subscriptions')
            .update({ status: 'canceled', canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('stripe_subscription_id', sub.id)
            .catch(() => {});
        }
        break;
      }
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
        const intentParams = {
          amount: amountInUnits,
          currency: donorCurrency.toLowerCase(),
          metadata,
          description: lineItems.map(i => `${i.quantity}x ${i.name}`).join(', '),
          statement_descriptor_suffix: storeConfig.statementDescriptor.substring(0, 22),
          payment_details: { order_reference: refCode },
          amount_details: { line_items: stripeLineItems }
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

      let stripeCustomerId = null;
      if (email) {
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
          status: 'completed',
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
                amount: parseFloat(donor.amount), currency: donor.currency,
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
      const amtParam = donor.amount ? `&amt=${encodeURIComponent(donor.amount)}` : '';
      const curParam = donor.currency ? `&cur=${encodeURIComponent(donor.currency)}` : '';
      const redirectUrl = campaignOrigin ? `${campaignOrigin}?status=complete${eidParam}${amtParam}${curParam}` : '/';

      StoreLog.event('redirect', donor.ref || '---', `→ ${redirectUrl}`);
      res.json({ success: true, redirectUrl, sessionId: donor.sid || null });
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

  router.post('/api/create-subscription-upsell', async (req, res) => {
    try {
      if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

      const { monthlyAmount, sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'Missing session', success: false });
      if (!monthlyAmount || monthlyAmount < 1) return res.status(400).json({ error: 'Invalid amount', success: false });

      const { data: session, error: sessErr } = await supabase
        .from('checkout_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessErr || !session) return res.status(400).json({ error: 'Session not found', success: false });

      const donorCurrency = (session.currency || 'EUR').toLowerCase();
      const decimals = getDecimals(donorCurrency.toUpperCase());
      const multiplier = Math.pow(10, decimals);
      const amountInUnits = Math.round(monthlyAmount * multiplier);

      const email = session.email || '';
      const mk = storeConfig.metadataKeys || {};

      let customerId = session.stripe_customer_id || null;

      if (!customerId && email) {
        const existing = await stripe.customers.list({ email, limit: 1 });
        if (existing.data.length > 0) customerId = existing.data[0].id;
      }

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: email || undefined,
          metadata: { [mk.sessionRef || 'sessionRef']: sessionId.substring(0, 12), upsell: 'true' }
        });
        customerId = customer.id;
      }

      if (session.stripe_payment_intent_id) {
        try {
          const pi = await stripe.paymentIntents.retrieve(session.stripe_payment_intent_id);
          if (pi.payment_method) {
            const pmId = typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method.id;
            try {
              await stripe.paymentMethods.attach(pmId, { customer: customerId });
            } catch (attachErr) {
              if (!attachErr.message?.includes('already been attached')) throw attachErr;
            }
            await stripe.customers.update(customerId, {
              invoice_settings: { default_payment_method: pmId }
            });
          }
        } catch (pmErr) {
          StoreLog.error('upsell_pm', session.campaign_ref || '---', pmErr.message);
        }
      }

      const price = await stripe.prices.create({
        unit_amount: amountInUnits,
        currency: donorCurrency,
        recurring: { interval: 'month' },
        product_data: { name: storeConfig.products?.[0]?.name || 'Monthly Support' }
      });

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: price.id }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        metadata: {
          [mk.referenceCode || 'referenceCode']: 'UPSELL-' + sessionId.substring(0, 8),
          cadence: 'monthly',
          upsell: 'true',
          original_session: sessionId
        },
        expand: ['latest_invoice.payment_intent']
      });

      const inv = subscription.latest_invoice;
      const pi = inv?.payment_intent;

      if (pi && pi.status === 'requires_payment_method') {
        const customer = await stripe.customers.retrieve(customerId);
        const defaultPm = customer.invoice_settings?.default_payment_method;
        if (defaultPm) {
          await stripe.paymentIntents.confirm(pi.id, { payment_method: defaultPm });
        }
      }

      StoreLog.event('upsell_created', session.campaign_ref || '---', `${subscription.id} - ${fmtAmount(monthlyAmount, donorCurrency.toUpperCase())} ${donorCurrency.toUpperCase()}/mo`);
      res.json({ success: true, subscriptionId: subscription.id });
    } catch (error) {
      StoreLog.error('upsell_failed', '---', error.message);
      res.status(500).json({ error: 'Subscription setup failed', success: false });
    }
  });

  return router;
};
