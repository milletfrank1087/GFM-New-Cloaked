const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');

const createAdminStoresRouter = require('./admin-stores');
const createAdminCustomersRouter = require('./admin-customers');

module.exports = function createAdminRouter(ctx) {
  const router = express.Router();
  const {
    JWT_SECRET,
    ADMIN_PASSWORD,
    ACTIVE_CAMPAIGN,
    loadCampaignFromFile,
    getAllCampaignFiles,
    getDashboardOverview,
    getAllPayments,
    getPaymentDetails,
    getRecentFailures,
    getProfitOverview,
    getChartTimeline,
    getAbTestMetrics,
    resetAbTestData,
    triggerAdSync
  } = ctx;

  function adminAuth(req, res, next) {
    const token = req.cookies.admin_token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  }

  function parseDashboardFilters(req) {
    const campaignFilter = req.query.campaign || 'all';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const dateRange = (startDate && endDate) ? { startDate, endDate } : null;
    return {
      campaignSlug: campaignFilter === 'all' ? null : campaignFilter,
      campaignFilter,
      dateRange,
      startDate,
      endDate
    };
  }

  function listCampaignsFromDisk() {
    return getAllCampaignFiles().map(f => {
      const data = JSON.parse(fs.readFileSync(f, 'utf-8'));
      return { id: data.id, title: data.title, goal: data.goal };
    });
  }

  router.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
      const token = jwt.sign({ admin: true }, JWT_SECRET);
      res.cookie('admin_token', token, { httpOnly: true, maxAge: 10 * 365 * 24 * 60 * 60 * 1000 });
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  });

  router.post('/api/admin/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.json({ success: true });
  });

  router.get('/api/admin/check', adminAuth, (req, res) => {
    res.json({ authenticated: true });
  });

  async function buildRecentDonors(campaignSlug, dateRange) {
    try {
      const recentPayments = await getAllPayments(campaignSlug);
      const filtered = dateRange
        ? recentPayments.filter(p =>
            p.rawDate >= dateRange.startDate && p.rawDate <= dateRange.endDate)
        : recentPayments;
      return filtered.slice(0, 10).map(p => ({
        id: p.id, name: p.name, displayName: p.displayName,
        amount: p.amount, tip: p.tipAmount, total: p.totalAmount, net: p.netAmount,
        currency: p.currency, time: p.date,
        initials: p.initials, color: p.color,
        transactionId: p.stripeChargeId, cardBrand: p.cardBrand,
        cardLastDigits: p.cardLastDigits, donationType: p.donationType,
        isAnonymous: p.isAnonymous, campaign: p.campaign, storeDomain: p.storeDomain
      }));
    } catch (e) {
      console.error('[admin/dashboard] recent donors fetch failed:', e.message);
      return [];
    }
  }

  router.get('/api/admin/dashboard', adminAuth, async (req, res) => {
    try {
      const { campaignSlug, campaignFilter, dateRange, startDate, endDate } = parseDashboardFilters(req);
      const includeAll = req.query.include === 'all';

      const overview = await getDashboardOverview(campaignSlug, dateRange);
      if (!overview) {
        return res.status(503).json({ error: 'Database unavailable' });
      }

      const recentDonors = await buildRecentDonors(campaignSlug, dateRange);
      const campaigns = listCampaignsFromDisk();
      const currentCampaign = loadCampaignFromFile(ACTIVE_CAMPAIGN);

      const response = {
        title: campaignFilter === 'all' ? 'All Campaigns' : (currentCampaign?.title || campaignFilter),
        goal: currentCampaign?.goal || 0,
        raised: overview.raised, tips: overview.tips, gross: overview.gross,
        fees: overview.fees, net: overview.net,
        donorCount: overview.donorCount, avgDonation: overview.avgDonation,
        transactionCount: overview.transactionCount,
        baseCurrency: overview.baseCurrency,
        currencyBreakdown: overview.currencyBreakdown,
        recentDonors, campaigns,
        campaignBreakdown: overview.campaignBreakdown,
        storeBreakdown: overview.storeBreakdown,
        filters: { campaign: campaignFilter, startDate: startDate || null, endDate: endDate || null }
      };

      if (includeAll) {
        response.timeAnalytics = overview.timeAnalytics;
        response.deviceAnalytics = overview.deviceAnalytics;
      }

      res.json(response);
    } catch (error) {
      console.error('[admin/dashboard] error:', error);
      res.status(500).json({ error: 'Failed to load data' });
    }
  });

  router.get('/api/admin/analytics/time', adminAuth, async (req, res) => {
    try {
      const { campaignSlug, dateRange } = parseDashboardFilters(req);
      const overview = await getDashboardOverview(campaignSlug, dateRange);
      res.json(overview?.timeAnalytics || {});
    } catch (error) {
      console.error('[admin/analytics/time] error:', error);
      res.status(500).json({ error: 'Failed to load time analytics' });
    }
  });

  router.get('/api/admin/analytics/device', adminAuth, async (req, res) => {
    try {
      const { campaignSlug, dateRange } = parseDashboardFilters(req);
      const overview = await getDashboardOverview(campaignSlug, dateRange);
      res.json(overview?.deviceAnalytics || {});
    } catch (error) {
      console.error('[admin/analytics/device] error:', error);
      res.status(500).json({ error: 'Failed to load device analytics' });
    }
  });

  router.get('/api/admin/transactions', adminAuth, async (req, res) => {
    try {
      const campaignFilter = req.query.campaign;
      const slug = campaignFilter && campaignFilter !== 'all' ? campaignFilter : null;
      res.json(await getAllPayments(slug));
    } catch (error) {
      console.error('[admin/transactions] error:', error);
      res.status(500).json({ error: 'Failed to load transactions' });
    }
  });

  router.get('/api/admin/transactions/:id', adminAuth, async (req, res) => {
    try {
      const details = await getPaymentDetails(req.params.id);
      if (!details) return res.status(404).json({ error: 'Transaction not found' });
      res.json(details);
    } catch (error) {
      console.error('[admin/transactions/:id] error:', error);
      res.status(500).json({ error: 'Failed to load transaction details' });
    }
  });

  router.get('/api/admin/failures', adminAuth, async (req, res) => {
    try {
      res.json(await getRecentFailures(50));
    } catch (error) {
      console.error('[admin/failures] error:', error);
      res.status(500).json({ error: 'Failed to load failures' });
    }
  });

  router.get('/api/admin/ab-test', adminAuth, async (req, res) => {
    try {
      const { campaignSlug, dateRange } = parseDashboardFilters(req);
      const rangeKey = req.query.range || 'allTime';
      const tzOffset = parseInt(req.query.tzOffset || 0, 10);
      const metrics = await getAbTestMetrics(campaignSlug, dateRange, rangeKey, tzOffset);
      res.json(metrics);
    } catch (error) {
      console.error('[admin/ab-test] error:', error);
      res.status(500).json({ error: 'Failed to load A/B test metrics' });
    }
  });

  router.post('/api/admin/ab-test/reset', adminAuth, (req, res) => {
    try {
      const result = resetAbTestData();
      res.json(result);
    } catch (error) {
      console.error('[admin/ab-test/reset] error:', error);
      res.status(500).json({ error: 'Failed to reset A/B test data' });
    }
  });

  router.get('/api/admin/profit/timeline', adminAuth, async (req, res) => {
    try {
      const { campaignSlug } = parseDashboardFilters(req);
      const chartRange = req.query.chartRange || 'today_hourly';
      const tzOffset = req.query.tzOffset || 0;
      const data = await getChartTimeline(campaignSlug, chartRange, tzOffset);
      res.json(data);
    } catch (error) {
      console.error('[admin/profit/timeline] error:', error);
      res.status(500).json({ error: 'Failed to load timeline data' });
    }
  });

  router.get('/api/admin/profit', adminAuth, async (req, res) => {
    try {
      const { campaignSlug, dateRange } = parseDashboardFilters(req);
      const includeAd = req.query.include_ads !== '0';
      const forceAdRefresh = req.query.force_ads === '1';
      const rangeKey = req.query.range || 'last30days';
      const tzOffset = req.query.tzOffset || 0;
      const overview = await getProfitOverview(campaignSlug, dateRange, { withAdSpend: includeAd, forceAdRefresh, rangeKey, tzOffset });
      res.json(overview);
    } catch (error) {
      console.error('[admin/profit] error:', error);
      res.status(500).json({ error: 'Failed to load profit data' });
    }
  });

  router.post('/api/admin/profit/ads-sync', adminAuth, async (req, res) => {
    try {
      res.json(await triggerAdSync());
    } catch (error) {
      console.error('[admin/profit/ads-sync] error:', error);
      res.status(500).json({ error: 'Failed to sync ad spend' });
    }
  });

  router.use(createAdminStoresRouter(ctx, adminAuth));
  router.use(createAdminCustomersRouter(ctx, adminAuth));

  return router;
};
