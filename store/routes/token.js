const express = require('express');
const router = express.Router();
const { decomposeAmount } = require('../lib/decompose');
const { CHECKOUT_LOCALE, CURRENCY_SYMBOLS } = require('../lib/locale');
const { getSymbol, getPosition, getDecimals, toSmallestUnit, formatAmount } = require('../lib/currency');
const { StoreLog, fmtAmount, extractOriginHost } = require('../lib/logger');
const { resolveCampaignCallbackUrl } = require('../lib/campaign-routing');
const { deviceLabel } = require('../lib/payment-forensics');

module.exports = function createTokenRouter(ctx) {
  const { supabase, storeConfig, PAYMENT_PROCESSOR, STORE_DOMAIN, CALLBACK_SECRET } = ctx;

  const V2_CAMPAIGN_SLUGS = new Set([
    'glioblastoma-grace',
    'glioblastoma-mariana',
    'glioblastoma-serafina',
    'glioblastoma-lucia',
    'glioblastoma-olivia',
    'glioblastoma-mia',
    'glejak-natalia'
  ]);
  function isStandaloneV2Campaign(ref) {
    return ref && V2_CAMPAIGN_SLUGS.has(ref);
  }

  // Checkout links that didn't open a checkout (expired / already used / unknown): the donor clicked Donate and
  // landed on the shop home instead. Saved so the drop-off is countable, not just a log line. Never throws.
  async function persistLinkProblem(req, eventType, tokenData, extra) {
    try {
      const { error } = await supabase.from('funnel_events').insert({
        campaign_slug: String(tokenData?.source_ref || 'unknown').slice(0, 60), event_type: eventType,
        visitor_id: tokenData?.tracking?.visitorId || null, store_domain: STORE_DOMAIN,
        ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null,
        country: tokenData?.tracking?.clientLocation?.countryCode || null,
        amount: tokenData?.amount != null ? parseFloat(tokenData.amount) : null, currency: tokenData?.currency || null,
        device_type: deviceLabel(req.headers['user-agent']),
        extra: Object.assign({ token: String(req.params.token || '').slice(0, 8), session: String(tokenData?.id || '').slice(0, 12) || null }, extra)
      });
      if (error) StoreLog.error('db_failed', '---', `funnel_events ${eventType}: ${error.message}`);
    } catch (err) {
      StoreLog.error('db_failed', '---', `funnel_events ${eventType}: ${err.message}`);
    }
  }

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
        // Tell "used twice" (reload / double tap / back button) apart from "never existed".
        const { data: used } = await supabase.from('checkout_sessions').select('id,source_ref,amount,currency,tracking,claimed_at')
          .eq('token', token).maybeSingle();
        StoreLog.event('token_invalid', used?.source_ref || '---', used ? `checkout link opened again (first opened ${used.claimed_at || '?'})` : 'Token not found or already claimed');
        persistLinkProblem(req, used ? 'Checkout_Link_Reused' : 'Checkout_Link_Invalid', used, used ? { first_claimed_at: used.claimed_at || null } : {});
        return res.redirect('/');
      }

      if (new Date(tokenData.expires_at) < new Date()) {
        const ref = tokenData.source_ref || '---';
        StoreLog.event('token_expired', ref, `${fmtAmount(tokenData.amount, tokenData.currency)} expired at ${tokenData.expires_at}`);
        persistLinkProblem(req, 'Checkout_Link_Expired', tokenData, { secs_late: Math.round((Date.now() - new Date(tokenData.expires_at).getTime()) / 1000) });
        return res.redirect('/');
      }

      const { error: claimErr } = await supabase
        .from('checkout_sessions')
        .update({ claimed: true, claimed_at: new Date().toISOString() })
        .eq('id', tokenData.id);
      if (claimErr) StoreLog.error('db_failed', tokenData.source_ref || '---', `checkout_sessions claim: ${claimErr.message}`);

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
      StoreLog.setDonor(tokenData.tracking);
      const tipAmt = parseFloat(tokenData.service_fee || 0);
      StoreLog.event('token_claimed', ref, `opened checkout · ${fmtAmount(tokenData.amount, tokenData.currency)}${tipAmt > 0 ? ' + ' + fmtAmount(tipAmt, tokenData.currency) + ' tip' : ''}${origin ? '' : ' (no campaign origin)'}`);

      res.cookie('__session', JSON.stringify(cookieData), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: 60 * 60 * 1000, // 10 min was too short: slower donors hit "No session found" when paying
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
      const hints = [
        '<https://js.stripe.com>; rel=preconnect; crossorigin',
        '<https://m.stripe.com>; rel=preconnect'
      ];
      if (storeConfig.localCSS) {
        hints.push('</css/tailwind-store.min.css>; rel=preload; as=style');
      } else {
        hints.push('<https://cdn.tailwindcss.com>; rel=preconnect');
      }
      res.writeEarlyHints({ link: hints });
    } catch (_) {}

    const sessionCookie = req.cookies.__session;
    const wantsStoreCheckout = req.query.store === '1';
    const sessionCookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/'
    };

    if (wantsStoreCheckout && sessionCookie) {
      res.clearCookie('__session', sessionCookieOpts);
      StoreLog.event('store_checkout', '---', 'Cleared donor session for public store checkout');
    }

    if (!wantsStoreCheckout && sessionCookie) {
      try {
        const donor = JSON.parse(sessionCookie);
        const lang = donor.lang || 'en';
        const locale = CHECKOUT_LOCALE[lang] || CHECKOUT_LOCALE.en;
        const donorCurrency = donor.currency || 'EUR';
        const symbol = getSymbol(donorCurrency);
        const symbolPosition = getPosition(donorCurrency);
        const decimals = getDecimals(donorCurrency);
        const totalAmount = parseFloat(donor.amount) + parseFloat(donor.fee || 0);
        const orderItems = decomposeAmount(totalAmount, storeConfig.products, donorCurrency);

        StoreLog.event('checkout_view', donor.ref || '---', `Viewing checkout - ${fmtAmount(totalAmount, donorCurrency)} ${donorCurrency}`);

        const campaignDisplay = donor.utm?.campaignDisplay || {};
        const donationAmount = parseFloat(donor.amount);
        const serviceFee = parseFloat(donor.fee || 0);

        const fmt = (n) => formatAmount(n, donorCurrency);

        const isSanctuary = donor.ref === 'sanctuary-defense-408' ||
                            donor.utm?.campaign === 'sanctuary_defense_408' ||
                            donor.utm?.template === 'petition2' ||
                            donor.utm?.template === 'advocacy-dossier' ||
                            donor.utm?.causeType === 'animal-welfare' ||
                            donor.utm?.theme === 'sanctuary';

        const checkoutTemplate = isSanctuary
          ? 'pages/checkout-sanctuary'
          : (donor.utm?.template === 'standalone-v2' || isStandaloneV2Campaign(donor.ref))
            ? 'pages/checkout-donor-v2'
            : 'pages/checkout-donor';

        const signer = donor.utm?.signer || {};
        const donorName = ((signer.firstName || '') + ' ' + (signer.lastName || '')).trim();
        const signerZip = donor.utm?.signer_zip || signer.zip || '';
        const cadence = donor.utm?.cadence || 'once';

        let campaignOrigin = '';
        try {
          const srcUrl = donor.utm?.sourceUrl || '';
          if (srcUrl) campaignOrigin = new URL(srcUrl).origin;
        } catch (_) {}
        if (!campaignOrigin) {
          const cbUrl = resolveCampaignCallbackUrl(donor, donor.ref);
          if (cbUrl) campaignOrigin = cbUrl;
        }

        return res.render(checkoutTemplate, {
          store: req.store,
          donor,
          locale,
          symbol,
          symbolPosition,
          currencyDecimals: decimals,
          paymentAmountUnits: toSmallestUnit(totalAmount, donorCurrency),
          totalAmount: totalAmount.toFixed(decimals),
          donationAmount: donationAmount.toFixed(decimals),
          serviceFee: serviceFee.toFixed(decimals),
          formattedTotal: fmt(totalAmount),
          formattedDonation: fmt(donationAmount),
          formattedFee: fmt(serviceFee),
          showFeeBreakdown: serviceFee > 0,
          campaignDisplay,
          campaignDisplayJson: JSON.stringify(campaignDisplay || {}).replace(/</g, '\\u003c').replace(/'/g, '\\u0027'),
          orderItems,
          paymentProcessor: PAYMENT_PROCESSOR,
          stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
          metaPixelId: donor.utm?.metaPixelId || null,
          tiktokPixelId: donor.utm?.tiktokPixelId || null,
          purchaseEventId: donor.utm?.eventId || null,
          donorCountryCode: donor.utm?.clientLocation?.countryCode || null,
          donorExternalId: donor.sid || null,
          donorEmail: donor.email || null,
          isSanctuary,
          donorName,
          signerZip,
          cadence,
          campaignOrigin
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

      const campaignSourceUrl = tracking.sourceUrl || null;
      const storeFallbackUrl = clientSourceUrl
        || `${req.protocol}://${req.get('host') || STORE_DOMAIN}/checkout`;
      const attributionSourceUrl = campaignSourceUrl || storeFallbackUrl;

      const donorIp = donor.ip
        || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.ip
        || 'unknown';
      const donorUa = donor.ua || req.headers['user-agent'] || 'unknown';

      const campaignUrl = resolveCampaignCallbackUrl(donor, donor.ref);
      if (!campaignUrl) {
        return res.json({ success: false, error: 'no campaign route' });
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch(`${campaignUrl}/api/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            event,
            eventId,
            sourceUrl: attributionSourceUrl,
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
        StoreLog.event('track_proxied', donor.ref || '---', `${event} → ${extractOriginHost(campaignUrl)}`);
      } catch (err) {
        StoreLog.error('track_proxy_failed', donor.ref || '---', `${event} → ${extractOriginHost(campaignUrl)}: ${err.message}`);
      }

      res.json({ success: true });
    } catch (_) {
      res.json({ success: false });
    }
  });

  return router;
};
