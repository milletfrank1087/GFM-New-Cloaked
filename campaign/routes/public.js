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
    getRecentRealDonations,
    getCampaignRealStats
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

  router.get('/api/campaign', async (req, res) => {
    try {
      const campaign = loadCampaignFromFile(ACTIVE_CAMPAIGN);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      let realStats = { realRaised: 0, realDonorCount: 0 };
      try {
        const [, stats] = await Promise.race([
          Promise.all([
            getRecentRealDonations(ACTIVE_CAMPAIGN, 20),
            getCampaignRealStats(ACTIVE_CAMPAIGN)
          ]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
        realStats = stats;
      } catch (e) {
        console.warn('⚠️ Supabase stats timed out, serving cached campaign data');
      }

      res.json({
        ...campaign,
        raised: (campaign.raised || 0) + realStats.realRaised,
        donorCount: (campaign.donorCount || 0) + realStats.realDonorCount,
        _realStats: {
          realRaised: realStats.realRaised,
          realDonorCount: realStats.realDonorCount
        }
      });
    } catch (error) {
      console.error('Error loading campaign:', error);
      res.status(500).json({ error: 'Failed to load campaign data' });
    }
  });

  router.get('/api/campaigns', async (req, res) => {
    try {
      const files = getAllCampaignFiles();

      const campaigns = await Promise.all(files.map(async filePath => {
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const realStats = await getCampaignRealStats(data.id);
        return {
          id: data.id,
          title: data.title,
          raised: (data.raised || 0) + realStats.realRaised,
          goal: data.goal
        };
      }));

      res.json({ active: ACTIVE_CAMPAIGN, campaigns });
    } catch (error) {
      console.error('Error listing campaigns:', error);
      res.status(500).json({ error: 'Failed to list campaigns' });
    }
  });

  return router;
};
