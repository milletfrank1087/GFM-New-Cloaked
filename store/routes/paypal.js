const express = require('express');
const { decomposeAmount } = require('../lib/decompose');
const { toSmallestUnit, fromSmallestUnit, getDecimals, formatAmount } = require('../lib/currency');
const { StoreLog, fmtAmount, extractOriginHost } = require('../lib/logger');
const { resolveCampaignCallbackUrl } = require('../lib/campaign-routing');
const { PAYPAL_CLIENT_ID, PAYPAL_API_BASE, getPayPalAccessToken } = require('../lib/paypal');

function classifyPayPalError(error, response, body) {
  const status = response ? response.status : 0;
  const code = (body && (body.name || body.error)) || (error && error.code) || 'UNKNOWN';
  const codeStr = String(code).toUpperCase();
  const isAuthFailure = status === 401 || status === 403 ||
    /INVALID_CLIENT|INVALID_TOKEN|AUTHENTICATION_FAILURE|NOT_AUTHORIZED|PERMISSION_DENIED/.test(codeStr);
  return {
    operatorActionable: isAuthFailure,
    code: codeStr,
    type: isAuthFailure ? 'PayPalAuthError' : 'PayPalError',
    class: isAuthFailure ? 'operator' : 'unknown'
  };
}

module.exports = function createPayPalRouter(ctx) {
  const { supabase, storeConfig, PAYMENT_PROCESSOR, STORE_DOMAIN, CALLBACK_SECRET, paymentState, emitAlert } = ctx;
  const router = express.Router();

  router.get('/api/payment/provider', (req, res) => {
    res.json({ provider: PAYMENT_PROCESSOR });
  });

  router.get('/api/paypal/client-id', (req, res) => {
    if (PAYMENT_PROCESSOR !== 'paypal') {
      return res.status(404).json({ error: 'PayPal not configured for this store' });
    }
    res.json({ clientId: PAYPAL_CLIENT_ID });
  });

  router.post('/api/paypal/orders', async (req, res) => {
    try {
      if (PAYMENT_PROCESSOR !== 'paypal') {
        return res.status(400).json({ error: 'PayPal not available' });
      }

      const sessionCookie = req.cookies.__session;
      if (!sessionCookie) {
        return res.status(400).json({ error: 'No session found' });
      }

      const donor = JSON.parse(sessionCookie);
      const totalAmount = parseFloat(donor.amount) + parseFloat(donor.fee || 0);
      const donorCurrency = donor.currency || 'EUR';
      const currencyDecimals = getDecimals(donorCurrency);
      const lineItems = decomposeAmount(totalAmount, storeConfig.products, donorCurrency);

      const refCode = (donor.sid || '').substring(0, 4).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const mk = storeConfig.metadataKeys || {};

      const sessionMeta = {
        [mk.storeId || 'storeId']: ctx.getStoreDbId() || '',
        [mk.sessionRef || 'sessionRef']: (donor.sid || '').substring(0, 12),
        [mk.referenceCode || 'referenceCode']: refCode,
      };

      const ppItems = lineItems.map(item => ({
        name: item.name.substring(0, 127),
        unit_amount: { currency_code: donorCurrency.toUpperCase(), value: item.price.toFixed(currencyDecimals) },
        quantity: String(item.quantity),
        category: 'DIGITAL_GOODS',
      }));

      const itemTotalUnits = ppItems.reduce(
        (sum, item) => sum + toSmallestUnit(item.unit_amount.value, donorCurrency) * parseInt(item.quantity, 10), 0
      );
      const orderTotalUnits = toSmallestUnit(totalAmount, donorCurrency);

      if (itemTotalUnits !== orderTotalUnits) {
        StoreLog.error('decompose_mismatch', donor.ref || '---', `itemTotal=${fromSmallestUnit(itemTotalUnits, donorCurrency)} orderTotal=${totalAmount}; rejecting to prevent overcharge`);
        return res.status(500).json({ error: 'Payment amount mismatch; please contact support' });
      }

      const orderTotalStr = fromSmallestUnit(orderTotalUnits, donorCurrency).toFixed(currencyDecimals);

      const customIdRaw = JSON.stringify(sessionMeta);
      const customId = customIdRaw.length > 127 ? customIdRaw.substring(0, 127) : customIdRaw;

      const orderPayload = {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: refCode,
          description: `Order from ${storeConfig.name}`,
          custom_id: customId,
          amount: {
            currency_code: donorCurrency.toUpperCase(),
            value: orderTotalStr,
            breakdown: {
              item_total: { currency_code: donorCurrency.toUpperCase(), value: orderTotalStr }
            }
          },
          items: ppItems,
        }],
        application_context: { shipping_preference: 'NO_SHIPPING' },
      };

      const accessToken = await getPayPalAccessToken();
      const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': `${ctx.getStoreDbId() || 'store'}-${refCode}-${Date.now()}`,
        },
        body: JSON.stringify(orderPayload),
      });

      const order = await response.json();

      if (!response.ok) {
        const errMsg = order.details?.[0]?.description || order.message || 'PayPal order creation failed';
        StoreLog.error('paypal_order_failed', donor.ref || '---', errMsg);
        return res.status(response.status).json({ error: errMsg });
      }

      StoreLog.event('paypal_order_created', donor.ref || '---', `${order.id} - ${fmtAmount(totalAmount, donor.currency)} ${donor.currency}`);
      res.json({ orderId: order.id, lineItems });
    } catch (error) {
      const ref = (() => { try { return JSON.parse(req.cookies.__session)?.ref; } catch (_) { return '---'; } })();
      const cls = classifyPayPalError(error, null, null);
      StoreLog.error('paypal_order_failed', ref, `${cls.code}: ${error.message}`);

      if (cls.operatorActionable) {
        if (paymentState) paymentState.tripFailFast({ errClass: 'operator', code: cls.code, message: error.message, ttlMs: 60 * 1000 });
        if (emitAlert) emitAlert({
          key: `paypal-${cls.code}`,
          title: `PayPal ${cls.type}: ${cls.code}`,
          severity: 'critical',
          context: {
            code: cls.code, message: error.message, donorRef: ref,
            hint: 'Verify PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET env vars and that the PayPal app is live'
          }
        });
      }

      if (supabase) {
        try {
          const sessionCookie = req.cookies.__session;
          const donor = sessionCookie ? JSON.parse(sessionCookie) : {};
          await supabase.from('payment_failures').insert({
            store_id: ctx.getStoreDbId(), source_ref: donor.ref,
            endpoint: '/api/paypal/orders', error_type: cls.type,
            error_code: cls.code, error_message: error.message,
            payment_method: 'paypal', request_amount: donor.amount,
            ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
          });
        } catch (logErr) {}
      }

      res.status(cls.operatorActionable ? 503 : 500).json({
        error: 'Failed to create payment',
        errorClass: cls.class,
        errorCode: cls.code
      });
    }
  });

  router.post('/api/paypal/orders/:orderID/capture', async (req, res) => {
    try {
      if (PAYMENT_PROCESSOR !== 'paypal') {
        return res.status(400).json({ error: 'PayPal not available' });
      }

      const { orderID } = req.params;
      const sessionCookie = req.cookies.__session;
      if (!sessionCookie || !orderID) {
        return res.status(400).json({ error: 'Missing data' });
      }

      const donor = JSON.parse(sessionCookie);

      const accessToken = await getPayPalAccessToken();
      const captureResponse = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });

      const captureData = await captureResponse.json();

      if (!captureResponse.ok || captureData.status !== 'COMPLETED') {
        const errMsg = captureData.details?.[0]?.description || captureData.message || 'Capture failed';
        StoreLog.error('paypal_capture_failed', donor.ref || '---', `${orderID}: ${errMsg}`);
        return res.status(captureResponse.status || 500).json({ error: errMsg });
      }

      const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0];

      if (capture?.status === 'DECLINED') {
        const responseCode = capture.processor_response?.response_code || 'DECLINED';
        const declineReasons = {
          '5120': 'Insufficient funds', '5100': 'Generic decline', '5130': 'Suspected fraud',
          '5140': 'Invalid card', '5150': 'Expired card', '5160': 'Invalid CVV',
          '5170': 'Exceeds withdrawal limit', '5950': 'Card declined by issuer',
          '0500': 'Generic decline - contact bank', 'PPMD': 'PayPal risk decline'
        };
        const reason = declineReasons[responseCode] || 'Card declined by bank';
        StoreLog.error('capture_declined', donor.ref || '---', `${orderID}: ${reason} (${responseCode})`);

        try {
          await supabase.from('payment_failures').insert({
            store_id: ctx.getStoreDbId(), source_ref: donor.ref,
            endpoint: '/api/paypal/orders/capture', error_type: 'CAPTURE_DECLINED',
            error_code: responseCode, error_message: `Capture declined: ${reason}`,
            payment_method: 'paypal', request_amount: donor.amount,
            ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
          });
        } catch (logErr) {}

        return res.status(400).json({ error: reason, status: 'DECLINED' });
      }

      if (capture?.status && capture.status !== 'COMPLETED') {
        StoreLog.error('capture_not_completed', donor.ref || '---', `${orderID}: status=${capture.status}`);
        return res.status(400).json({ error: `Payment ${capture.status.toLowerCase()}. Please try again.`, status: capture.status });
      }

      const paymentSource = captureData.payment_source;
      const payer = captureData.payer;
      const expectedTotal = parseFloat(donor.amount) + parseFloat(donor.fee || 0);
      const totalAmount = parseFloat(capture?.amount?.value || expectedTotal);

      let paypalFee = 0;
      if (capture?.seller_receivable_breakdown?.paypal_fee?.value) {
        paypalFee = parseFloat(capture.seller_receivable_breakdown.paypal_fee.value);
      }

      let cardHolderName = '';
      let cardLastDigits = null;
      let cardBrand = null;
      let cardExpiry = null;
      let cardType = null;
      let sourceType = 'card';

      if (paymentSource?.card) {
        cardHolderName = paymentSource.card.name || '';
        cardLastDigits = paymentSource.card.last_digits || null;
        cardBrand = paymentSource.card.brand || null;
        cardType = paymentSource.card.type || null;
        if (paymentSource.card.expiry) cardExpiry = paymentSource.card.expiry;
        sourceType = 'card';
      } else if (paymentSource?.paypal) {
        cardHolderName = paymentSource.paypal.name?.given_name
          ? `${paymentSource.paypal.name.given_name} ${paymentSource.paypal.name.surname || ''}`.trim()
          : '';
        sourceType = 'paypal';
      } else if (paymentSource?.venmo) {
        cardHolderName = paymentSource.venmo.user_name || '';
        sourceType = 'venmo';
      } else if (paymentSource?.apple_pay) {
        cardHolderName = paymentSource.apple_pay.card?.name || '';
        cardLastDigits = paymentSource.apple_pay.card?.last_digits || null;
        cardBrand = paymentSource.apple_pay.card?.brand || null;
        sourceType = 'apple_pay';
      } else if (paymentSource?.google_pay) {
        cardHolderName = paymentSource.google_pay.name || paymentSource.google_pay.card?.name || '';
        cardLastDigits = paymentSource.google_pay.card?.last_digits || null;
        cardBrand = paymentSource.google_pay.card?.brand || null;
        sourceType = 'google_pay';
      }

      if (!cardHolderName && payer) {
        cardHolderName = payer.name?.given_name
          ? `${payer.name.given_name} ${payer.name.surname || ''}`.trim()
          : '';
      }

      const brandDisplay = cardBrand ? cardBrand.charAt(0).toUpperCase() + cardBrand.slice(1) : sourceType;
      StoreLog.event('payment_ok', donor.ref || '---', `${fmtAmount(totalAmount, donor.currency)} ${donor.currency} via PayPal ${brandDisplay} ${cardLastDigits ? '****' + cardLastDigits : ''} (${cardHolderName || 'anonymous'})`);

      let donorName = cardHolderName || 'Anonymous';
      if (donor.guest) donorName = 'Anonymous';

      const donorNameReal = cardHolderName || 'Unknown';
      if (!donor.guest && donorNameReal !== 'Unknown') {
        const parts = donorNameReal.trim().split(/\s+/);
        donorName = parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : donorNameReal;
      }

      const lineItems = decomposeAmount(parseFloat(donor.amount) + parseFloat(donor.fee || 0), storeConfig.products, donor.currency || 'EUR');

      let customerId = null;
      const email = donor.email || payer?.email_address || null;

      if (email) {
        const { data: existingCustomer } = await supabase
          .from('customers').select('id').eq('email', email).maybeSingle();

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
              country: payer?.address?.country_code || null,
              color_gradient: ['from-blue-400 to-blue-500', 'from-violet-400 to-violet-500', 'from-rose-400 to-rose-500', 'from-emerald-400 to-emerald-500'][Math.floor(Math.random() * 4)],
              utm_source: donor.utm?.utm_source || null, utm_medium: donor.utm?.utm_medium || null,
              utm_campaign: donor.utm?.utm_campaign || null, referrer_url: donor.utm?.referrer || null
            })
            .select().single();

          if (custInsertErr) {
            StoreLog.error('customer_insert_failed', donor.ref || '---', `${email}: ${custInsertErr.message}`);
          }
          customerId = newCustomer?.id || null;
          StoreLog.event('customer_new', donor.ref || '---', `${email}${customerId ? '' : ' UNLINKED'}`);
        }
      }

      await supabase.from('payments').insert({
        customer_id: customerId, store_id: ctx.getStoreDbId(), store_domain: STORE_DOMAIN,
        source_ref: donor.ref, payment_method: 'paypal',
        stripe_payment_intent_id: orderID, stripe_charge_id: capture?.id || null,
        amount: parseFloat(donor.amount), service_fee: parseFloat(donor.fee || 0),
        total_amount: totalAmount, stripe_fee: paypalFee, net_amount: totalAmount - paypalFee,
        currency: donor.currency, payment_source: sourceType, status: 'completed',
        line_items: lineItems, customer_name: donorName, billing_name: donorNameReal,
        guest_checkout: donor.guest || false,
        card_holder_name: cardHolderName || null, card_last_digits: cardLastDigits,
        card_brand: cardBrand, card_expiry: cardExpiry, card_type: cardType,
        customer_email: email,
        ip_address: donor.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
        user_agent: donor.ua || req.headers['user-agent'],
        fbp: donor.utm?.fbp || null, fbc: donor.utm?.fbc || null, fbclid: donor.utm?.fbclid || null,
        ttp: donor.utm?.ttp || null, ttclid: donor.utm?.ttclid || null,
        utm_source: donor.utm?.utm_source || null, utm_medium: donor.utm?.utm_medium || null,
        utm_campaign: donor.utm?.utm_campaign || null, utm_content: donor.utm?.utm_content || null,
        utm_term: donor.utm?.utm_term || null,
        referrer_url: donor.utm?.referrer || null, landing_url: donor.utm?.sourceUrl || null,
        stripe_response: {
          paypalOrderId: orderID, captureId: capture?.id, status: captureData.status,
          amount: capture?.amount?.value, currency: capture?.amount?.currency_code,
          paymentSource: sourceType, cardBrand, cardLast4: cardLastDigits,
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
              secret: CALLBACK_SECRET, tokenId: donor.sid,
              paymentData: {
                amount: parseFloat(donor.amount), currency: donor.currency, paymentMethod: 'paypal',
                storeDomain: STORE_DOMAIN, stripeChargeId: capture?.id || orderID,
                cardHolderName, donorNameReal, donorEmail: email, customerId,
                ipAddress: donor.ip, userAgent: donor.ua, tracking: donor.utm || {}
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
      StoreLog.error('paypal_capture_failed', ref, `${error.code || 'ERROR'}: ${error.message}`);

      try {
        const sessionCookie = req.cookies.__session;
        const donor = sessionCookie ? JSON.parse(sessionCookie) : {};
        await supabase.from('payment_failures').insert({
          store_id: ctx.getStoreDbId(), source_ref: donor.ref,
          endpoint: '/api/paypal/orders/capture', error_type: 'PAYPAL_CAPTURE_ERROR',
          error_code: error.code || 'UNKNOWN', error_message: error.message,
          payment_method: 'paypal',
          ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
        });
      } catch (logErr) {}

      res.status(500).json({ error: 'Failed to capture payment' });
    }
  });

  router.post('/api/paypal/applepay/validate-merchant', async (req, res) => {
    try {
      if (PAYMENT_PROCESSOR !== 'paypal') {
        return res.status(400).json({ error: 'PayPal not available' });
      }

      const accessToken = await getPayPalAccessToken();
      const { validationUrl } = req.body;

      const response = await fetch(`${PAYPAL_API_BASE}/v1/billing-agreements/agreement-tokens`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ validationUrl, displayName: storeConfig.name, domainName: STORE_DOMAIN }),
      });

      const data = await response.json();
      res.json(data);
    } catch (error) {
      StoreLog.error('applepay_validation', '---', error.message);
      res.status(500).json({ error: 'Merchant validation failed' });
    }
  });

  router.post('/api/paypal/store-checkout', async (req, res) => {
    try {
      if (PAYMENT_PROCESSOR !== 'paypal') {
        return res.status(400).json({ error: 'PayPal not available' });
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

      const refCode = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const currencyCode = (storeConfig.currency || 'GBP').toUpperCase();
      const storeDecimals = getDecimals(currencyCode);

      const ppItems = validItems.map(item => ({
        name: item.name.substring(0, 127),
        unit_amount: { currency_code: currencyCode, value: item.price.toFixed(storeDecimals) },
        quantity: String(item.quantity),
        category: 'DIGITAL_GOODS',
      }));

      const storeItemTotal = ppItems.reduce(
        (sum, item) => sum + parseFloat(item.unit_amount.value) * parseInt(item.quantity, 10), 0
      );
      const storeItemTotalStr = storeItemTotal.toFixed(storeDecimals);

      const orderPayload = {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: refCode,
          description: `Order from ${storeConfig.name}`,
          amount: {
            currency_code: currencyCode, value: storeItemTotalStr,
            breakdown: { item_total: { currency_code: currencyCode, value: storeItemTotalStr } }
          },
          items: ppItems,
        }],
        application_context: { shipping_preference: 'NO_SHIPPING' },
      };

      const accessToken = await getPayPalAccessToken();
      const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json',
          'PayPal-Request-Id': `store-${refCode}-${Date.now()}`,
        },
        body: JSON.stringify(orderPayload),
      });

      const order = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({ error: order.message || 'PayPal order creation failed' });
      }

      StoreLog.event('store_checkout', refCode, `PayPal ${order.id} - ${formatAmount(total, currencyCode)} - ${validItems.map(i => `${i.quantity}x ${i.name}`).join(', ')}`);
      res.json({ orderId: order.id, amount: total.toFixed(storeDecimals) });
    } catch (error) {
      StoreLog.error('store_checkout', '---', `PayPal: ${error.message}`);
      res.status(500).json({ error: 'Payment setup failed' });
    }
  });

  return router;
};
