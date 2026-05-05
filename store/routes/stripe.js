const express = require('express');
const { decomposeAmount } = require('../lib/decompose');
const { StoreLog, fmtAmount, extractOriginHost } = require('../lib/logger');
const { resolveCampaignCallbackUrl } = require('../lib/campaign-routing');

module.exports = function createStripeRouter(ctx) {
  const { stripe, supabase, storeConfig, STORE_DOMAIN, CALLBACK_SECRET } = ctx;
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
        StoreLog.event('webhook_ok', ref, `Payment succeeded ${pi.id} - ${pi.amount / 100} ${pi.currency.toUpperCase()}`);
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
            request_amount: pi.amount / 100
          }).catch(() => {});
        }
        break;
      }
      case 'charge.dispute.created': {
        const dispute = event.data.object;
        StoreLog.error('webhook_dispute', ref, `DISPUTE ${dispute.id} - ${dispute.amount / 100} ${dispute.currency} - ${dispute.reason}`);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object;
        StoreLog.event('webhook_refund', ref, `Refund ${charge.id} - ${charge.amount_refunded / 100} ${charge.currency}`);
        break;
      }
    }

    res.status(200).json({ received: true });
  });

  router.post('/api/create-payment', async (req, res) => {
    try {
      if (!stripe) {
        return res.status(400).json({ error: 'Stripe not configured for this store' });
      }

      const sessionCookie = req.cookies.__session;
      if (!sessionCookie) {
        return res.status(400).json({ error: 'No session found' });
      }

      const donor = JSON.parse(sessionCookie);
      const totalAmount = parseFloat(donor.amount) + parseFloat(donor.fee || 0);
      const amountInCents = Math.round(totalAmount * 100);
      const lineItems = decomposeAmount(totalAmount, storeConfig.products);

      const refCode = (donor.sid || '').substring(0, 4).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const mk = storeConfig.metadataKeys || {};

      const metadata = {
        [mk.storeId || 'storeId']: ctx.getStoreDbId() || '',
        [mk.storeDomain || 'storeDomain']: STORE_DOMAIN,
        [mk.referenceCode || 'referenceCode']: refCode,
        [mk.sessionRef || 'sessionRef']: (donor.sid || '').substring(0, 12),
        [mk.subtotal || 'subtotal']: String(donor.amount),
        [mk.serviceFee || 'serviceFee']: String(donor.fee || 0),
        [mk.guestCheckout || 'guestCheckout']: String(donor.guest || false),
        [mk.orderSummary || 'orderSummary']: lineItems.map(i => `${i.quantity}x ${i.name}`).join(', ')
      };

      const stripeLineItems = lineItems.map(item => ({
        product_name: item.name.substring(0, 26),
        product_code: (item.slug || 'item').substring(0, 12).toUpperCase().replace(/-/g, ''),
        quantity: item.quantity,
        unit_cost: Math.round(item.price * 100),
        unit_of_measure: 'ACT',
        tax: { total_tax_amount: 0 }
      }));

      const intentParams = {
        amount: amountInCents,
        currency: donor.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata,
        description: lineItems.map(i => `${i.quantity}x ${i.name}`).join(', '),
        statement_descriptor_suffix: storeConfig.statementDescriptor.substring(0, 22),
        payment_details: { order_reference: refCode },
        amount_details: { line_items: stripeLineItems }
      };

      const paymentIntent = await stripe.paymentIntents.create(intentParams);

      StoreLog.event('payment_created', donor.ref || '---', `${paymentIntent.id.substring(0, 18)}... - ${fmtAmount(totalAmount, donor.currency)} ${donor.currency}`);

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: totalAmount.toFixed(2),
        lineItems
      });
    } catch (error) {
      const ref = (() => { try { return JSON.parse(req.cookies.__session)?.ref; } catch (_) { return '---'; } })();
      StoreLog.error('payment_failed', ref, `${error.code || 'STRIPE_ERROR'}: ${error.message}`);

      try {
        const sessionCookie = req.cookies.__session;
        const donor = sessionCookie ? JSON.parse(sessionCookie) : {};
        await supabase.from('payment_failures').insert({
          store_id: ctx.getStoreDbId(),
          source_ref: donor.ref,
          endpoint: '/api/create-payment',
          error_type: 'STRIPE_ERROR',
          error_code: error.code || 'UNKNOWN',
          error_message: error.message,
          request_amount: donor.amount,
          ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
        });
      } catch (logErr) {}

      res.status(500).json({ error: 'Failed to create payment' });
    }
  });

  router.post('/api/confirm-payment', async (req, res) => {
    try {
      if (!stripe) {
        return res.status(400).json({ error: 'Stripe not configured for this store' });
      }

      const { paymentIntentId } = req.body;
      const sessionCookie = req.cookies.__session;
      if (!sessionCookie || !paymentIntentId) {
        return res.status(400).json({ error: 'Missing data' });
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
        const feeInSettlement = resolvedBt.fee / 100;
        stripeFee = resolvedBt.exchange_rate ? feeInSettlement / resolvedBt.exchange_rate : feeInSettlement;
      }

      const totalAmount = paymentIntent.amount / 100;

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

      const lineItems = decomposeAmount(parseFloat(donor.amount) + parseFloat(donor.fee || 0), storeConfig.products);

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
          await stripe.paymentIntents.update(paymentIntentId, { customer: stripeCustomerId, receipt_email: email });
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
          service_fee: parseFloat(donor.fee || 0),
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
          stripe_response: {
            paymentIntentId: paymentIntent.id, chargeId: charge?.id,
            status: paymentIntent.status, amount: paymentIntent.amount,
            currency: paymentIntent.currency, cardBrand, cardLast4: cardLastDigits,
            walletType: pm?.card?.wallet?.type || null
          }
        });

      const fmk = storeConfig.metadataKeys || {};
      await stripe.paymentIntents.update(paymentIntent.id, {
        metadata: {
          ...paymentIntent.metadata,
          [fmk.fulfillmentStatus || 'fulfillment_status']: 'delivered',
          [fmk.fulfilledAt || 'fulfilled_at']: new Date().toISOString(),
          [fmk.deliveryMethod || 'delivery_method']: 'digital_download'
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
      res.json({ success: true, redirectUrl });
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

      const amountInCents = Math.round(total * 100);
      const mk = storeConfig.metadataKeys || {};
      const refCode = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

      const intentParams = {
        amount: amountInCents,
        currency: 'gbp',
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
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
            unit_cost: Math.round(item.price * 100),
            unit_of_measure: 'ACT',
            tax: { total_tax_amount: 0 }
          }))
        }
      };

      const paymentIntent = await stripe.paymentIntents.create(intentParams);

      StoreLog.event('store_checkout', refCode, `${paymentIntent.id.substring(0, 18)}... - £${total.toFixed(2)} - ${validItems.map(i => `${i.quantity}x ${i.name}`).join(', ')}`);

      res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id, amount: total.toFixed(2) });
    } catch (error) {
      StoreLog.error('store_checkout', '---', `${error.code || 'ERROR'}: ${error.message}`);
      res.status(500).json({ error: 'Payment setup failed' });
    }
  });

  return router;
};
