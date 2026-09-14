const express = require('express');

module.exports = function createPublicRouter(ctx) {
  const router = express.Router();
  const {
    DEFAULT_LANGUAGE,
    ACTIVE_CURRENCY,
    MERCHANT_COUNTRY,
    ACTIVE_CAMPAIGN,
    getTrackingConfig,
    loadCampaignFromFile,
    getAllCampaignFiles,
    getCachedCampaignJSON
  } = ctx;

  router.get('/api/language/config', (req, res) => {
    res.json({ defaultLanguage: DEFAULT_LANGUAGE });
  });

  router.get('/api/currency/config', (req, res) => {
    res.json({ ...ACTIVE_CURRENCY, countryCode: MERCHANT_COUNTRY });
  });

  router.get('/api/tracking/config', (req, res) => {
    const config = getTrackingConfig();
    const fbp = req.cookies._fbp || null;
    res.json({ ...config, fbp });
  });

  router.post('/api/ab/event', (req, res) => {
    try {
      const { variant, eventName, data } = req.body || {};
      const targetVariant = variant || req.cookies?._ab_variant || 'control';
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
      const { recordEngagementEvent } = require('../lib/ab-testing');
      recordEngagementEvent(targetVariant, eventName, data, ip, req);
      res.json({ ok: true });
    } catch (e) {
      res.status(200).json({ ok: false });
    }
  });

  router.get('/api/campaign', (req, res) => {
    try {
      const cached = typeof getCachedCampaignJSON === 'function' ? getCachedCampaignJSON() : null;
      if (cached) {
        res.type('application/json').send(cached);
        return;
      }

      const campaign = loadCampaignFromFile(ACTIVE_CAMPAIGN);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      res.json(campaign);
    } catch (error) {
      console.error('Error loading campaign:', error);
      res.status(500).json({ error: 'Failed to load campaign data' });
    }
  });

  router.get('/api/campaigns', (req, res) => {
    try {
      const fs = require('fs');
      const files = getAllCampaignFiles();
      const campaigns = files.map(filePath => {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return {
          id: data.id,
          title: data.title,
          raised: data.raised || 0,
          goal: data.goal
        };
      });
      res.json({ active: ACTIVE_CAMPAIGN, campaigns });
    } catch (error) {
      console.error('Error listing campaigns:', error);
      res.status(500).json({ error: 'Failed to list campaigns' });
    }
  });

  return router;
};
