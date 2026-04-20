const express = require('express');
const router = express.Router();
const { decomposeAmount } = require('../lib/decompose');
const { CHECKOUT_LOCALE, CURRENCY_SYMBOLS } = require('../lib/locale');
const { StoreLog, fmtAmount, extractOriginHost } = require('../lib/logger');

module.exports = function createTokenRouter(ctx) {
  const { supabase, storeConfig, PAYMENT_PROCESSOR, STORE_DOMAIN, CALLBACK_SECRET } = ctx;

  router.get('/s/:token', async (req, res) => {
    try {
      try {
        res.writeEarlyHints({
          link: [
            '<https://js.stripe.com>; rel=preconnect; crossorigin',
            '<https://m.stripe.com>; rel=preconnect'
          ]
        });
      } catch (_) {}

      const { token } = req.params;

      const { data: tokenData, error } = await supabase
        .from('checkout_sessions')
        .select('*')
        .eq('token', token)
        .eq('claimed', false)
        .single();

      if (error || !tokenData) {
        StoreLog.event('token_invalid', '---', 'Token not found or already claimed');
        return res.redirect('/');
      }

      if (new Date(tokenData.expires_at) < new Date()) {
        const ref = tokenData.source_ref || '---';
        StoreLog.event('token_expired', ref, `${fmtAmount(tokenData.amount, tokenData.currency)} expired at ${tokenData.expires_at}`);
        return res.redirect('/');
      }

      await supabase
        .from('checkout_sessions')
        .update({ claimed: true, claimed_at: new Date().toISOString() })
        .eq('id', tokenData.id);

      const cookieData = {
        sid: tokenData.id,
        amount: tokenData.amount,
        currency: tokenData.currency,
        lang: tokenData.language,
        ref: tokenData.source_ref,
        fee: tokenData.service_fee,
        guest: tokenData.guest_checkout,
        email: tokenData.customer_email,
        utm: tokenData.tracking,
        ip: tokenData.ip_address,
        ua: tokenData.user_agent,
        storeId: ctx.getStoreDbId() || tokenData.store_id
      };

      const ref = tokenData.source_ref || '---';
      const origin = extractOriginHost(tokenData.tracking?.sourceUrl);
      StoreLog.event('token_claimed', ref, `${fmtAmount(tokenData.amount, tokenData.currency)} + ${fmtAmount(tokenData.service_fee, tokenData.currency)} fee from ${origin || 'direct'}`);

      res.cookie('__session', JSON.stringify(cookieData), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: 10 * 60 * 1000,
        path: '/'
      });

      res.send('<!DOCTYPE html><html><head><meta name="referrer" content="no-referrer"></head><body><script>location.replace(\'/checkout\')</script></body></html>');
    } catch (err) {
      StoreLog.error('token_error', '---', err.message);
      res.redirect('/');
    }
  });

  router.get('/checkout', (req, res) => {
    try {
      res.writeEarlyHints({
        link: [
          '<https://js.stripe.com>; rel=preconnect; crossorigin',
          '<https://m.stripe.com>; rel=preconnect',
          '</css/tailwind-store.min.css>; rel=preload; as=style'
        ]
      });
    } catch (_) {}

    const sessionCookie = req.cookies.__session;

    if (sessionCookie) {
      try {
        const donor = JSON.parse(sessionCookie);
        const lang = donor.lang || 'en';
        const locale = CHECKOUT_LOCALE[lang] || CHECKOUT_LOCALE.en;
        const symbol = CURRENCY_SYMBOLS[donor.currency] || donor.currency;
        const totalAmount = parseFloat(donor.amount) + parseFloat(donor.fee || 0);
        const orderItems = decomposeAmount(totalAmount, storeConfig.products);

        StoreLog.event('checkout_view', donor.ref || '---', `Viewing checkout - ${fmtAmount(totalAmount, donor.currency)} ${donor.currency}`);

        const campaignDisplay = donor.utm?.campaignDisplay || {};
        const donationAmount = parseFloat(donor.amount);
        const serviceFee = parseFloat(donor.fee || 0);

        return res.render('pages/checkout-donor', {
          store: req.store,
          donor,
          locale,
          symbol,
          totalAmount: totalAmount.toFixed(2),
          donationAmount: donationAmount.toFixed(2),
          serviceFee: serviceFee.toFixed(2),
          showFeeBreakdown: serviceFee > 0,
          campaignDisplay,
          orderItems,
          paymentProcessor: PAYMENT_PROCESSOR,
          stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
          metaPixelId: donor.utm?.metaPixelId || null,
          tiktokPixelId: donor.utm?.tiktokPixelId || null
        });
      } catch (e) {
        StoreLog.error('checkout_view', '---', `Session parse error: ${e.message}`);
      }
    }

    StoreLog.event('store_view', '---', 'Regular store visitor');

    res.render('pages/checkout-store', {
      store: req.store,
      products: storeConfig.products || [],
      paymentProcessor: PAYMENT_PROCESSOR,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      metaPixelId: null,
      tiktokPixelId: null
    });
  });

  router.post('/api/track-interaction', async (req, res) => {
    try {
      const { event, eventId, data, sourceUrl: clientSourceUrl } = req.body;
      if (!event || !eventId) return res.json({ success: false });

      const sessionCookie = req.cookies.__session;
      if (!sessionCookie) return res.json({ success: false });

      const donor = JSON.parse(sessionCookie);
      const tracking = donor.utm || {};

      const storeSourceUrl = clientSourceUrl
        || `${req.protocol}://${req.get('host') || STORE_DOMAIN}/checkout`;

      const donorIp = donor.ip
        || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.ip
        || 'unknown';
      const donorUa = donor.ua || req.headers['user-agent'] || 'unknown';

      const campaignCallbackUrls = (process.env.CAMPAIGN_CALLBACK_URLS || '').split(',').filter(Boolean);
      for (const baseUrl of campaignCallbackUrls) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          await fetch(`${baseUrl.trim()}/api/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              event,
              eventId,
              sourceUrl: storeSourceUrl,
              cookies: {
                fbp: tracking.fbp || null,
                fbc: tracking.fbc || null,
                ttp: tracking.ttp || null,
                ttclid: tracking.ttclid || null
              },
              clientLocation: tracking.clientLocation || null,
              data: data || {},
              storeProxy: {
                secret: CALLBACK_SECRET,
                ipAddress: donorIp,
                userAgent: donorUa,
                email: donor.email || null,
                storeDomain: STORE_DOMAIN
              }
            })
          }).finally(() => clearTimeout(timeout));
        } catch (err) {
          StoreLog.error('track_proxy_failed', donor.ref || '---', `${event} → ${extractOriginHost(baseUrl)}: ${err.message}`);
        }
      }

      StoreLog.event('track_proxied', donor.ref || '---', `${event} → campaign CAPI`);
      res.json({ success: true });
    } catch (_) {
      res.json({ success: false });
    }
  });

  return router;
};
