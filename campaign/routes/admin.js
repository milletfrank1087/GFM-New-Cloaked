const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

module.exports = function createAdminRouter(ctx) {
  const router = express.Router();
  const {
    JWT_SECRET,
    ADMIN_PASSWORD,
    ACTIVE_CAMPAIGN,
    loadCampaignFromFile,
    getAllCampaignFiles,
    getAdminDashboardStats,
    getAllPayments,
    getAllCustomers,
    getCustomerDetails,
    getPaymentDetails,
    getRecentFailures,
    deleteCustomer,
    toggleCustomerStatus,
    updateCustomerNotes,
    getTimeBasedAnalytics,
    getDeviceBrowserAnalytics,
    getStoreStats,
    toggleStoreStatus
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

  router.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
      const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '24h' });
      res.cookie('admin_token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
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

  router.get('/api/admin/dashboard', adminAuth, async (req, res) => {
    try {
      const campaignFilter = req.query.campaign || 'all';
      const startDate = req.query.startDate;
      const endDate = req.query.endDate;
      const dateRange = (startDate && endDate) ? { startDate, endDate } : null;

      const realStats = await getAdminDashboardStats(
        campaignFilter === 'all' ? null : campaignFilter,
        dateRange
      );

      const recentPayments = await getAllPayments(campaignFilter === 'all' ? null : campaignFilter);

      const recentDonors = recentPayments.slice(0, 10).map(p => ({
        id: p.id,
        name: p.name,
        displayName: p.displayName,
        amount: p.amount,
        currency: p.currency,
        time: p.date,
        initials: p.initials,
        color: p.color,
        transactionId: p.stripeChargeId,
        cardBrand: p.cardBrand,
        cardLastDigits: p.cardLastDigits,
        donationType: p.donationType,
        isAnonymous: p.isAnonymous,
        campaign: p.campaign,
        storeDomain: p.storeDomain
      }));

      const campaignFiles = getAllCampaignFiles();
      const campaigns = campaignFiles.map(f => {
        const data = JSON.parse(fs.readFileSync(f, 'utf-8'));
        return { id: data.id, title: data.title, goal: data.goal };
      });

      const currentCampaign = loadCampaignFromFile(ACTIVE_CAMPAIGN);

      res.json({
        title: campaignFilter === 'all' ? 'All Campaigns' : (currentCampaign?.title || campaignFilter),
        goal: currentCampaign?.goal || 0,
        raised: realStats?.raised || 0,
        tips: realStats?.tips || 0,
        gross: realStats?.gross || 0,
        fees: realStats?.fees || 0,
        net: realStats?.net || 0,
        donorCount: realStats?.donorCount || 0,
        avgDonation: realStats?.avgDonation || 0,
        transactionCount: realStats?.transactionCount || 0,
        baseCurrency: realStats?.baseCurrency || 'EUR',
        currencyBreakdown: realStats?.currencyBreakdown || {},
        recentDonors,
        campaigns,
        campaignBreakdown: realStats?.campaignBreakdown || {},
        filters: {
          campaign: campaignFilter,
          startDate: startDate || null,
          endDate: endDate || null
        }
      });
    } catch (error) {
      console.error('Error loading dashboard:', error);
      res.status(500).json({ error: 'Failed to load data' });
    }
  });

  router.get('/api/admin/analytics/time', adminAuth, async (req, res) => {
    try {
      const campaignFilter = req.query.campaign || 'all';
      const startDate = req.query.startDate;
      const endDate = req.query.endDate;
      const dateRange = (startDate && endDate) ? { startDate, endDate } : null;

      const timeAnalytics = await getTimeBasedAnalytics(
        campaignFilter === 'all' ? null : campaignFilter,
        dateRange
      );
      res.json(timeAnalytics || {});
    } catch (error) {
      console.error('Error loading time analytics:', error);
      res.status(500).json({ error: 'Failed to load time analytics' });
    }
  });

  router.get('/api/admin/analytics/device', adminAuth, async (req, res) => {
    try {
      const campaignFilter = req.query.campaign || 'all';
      const startDate = req.query.startDate;
      const endDate = req.query.endDate;
      const dateRange = (startDate && endDate) ? { startDate, endDate } : null;

      const deviceAnalytics = await getDeviceBrowserAnalytics(
        campaignFilter === 'all' ? null : campaignFilter,
        dateRange
      );
      res.json(deviceAnalytics || {});
    } catch (error) {
      console.error('Error loading device analytics:', error);
      res.status(500).json({ error: 'Failed to load device analytics' });
    }
  });

  router.get('/api/admin/stores', adminAuth, async (req, res) => {
    try {
      const stores = await getStoreStats();
      res.json(stores);
    } catch (error) {
      console.error('Error loading stores:', error);
      res.status(500).json({ error: 'Failed to load stores' });
    }
  });

  router.post('/api/admin/stores/:id/toggle', adminAuth, async (req, res) => {
    try {
      const { status } = req.body;
      const result = await toggleStoreStatus(req.params.id, status);
      res.json(result);
    } catch (error) {
      console.error('Error toggling store:', error);
      res.status(500).json({ error: 'Failed to toggle store' });
    }
  });

  router.get('/api/admin/customers', adminAuth, async (req, res) => {
    try {
      const customers = await getAllCustomers();
      res.json(customers);
    } catch (error) {
      console.error('Error loading customers:', error);
      res.status(500).json({ error: 'Failed to load customers' });
    }
  });

  router.get('/api/admin/customers/:id', adminAuth, async (req, res) => {
    try {
      const details = await getCustomerDetails(req.params.id);
      if (!details) return res.status(404).json({ error: 'Customer not found' });
      res.json(details);
    } catch (error) {
      console.error('Error loading customer details:', error);
      res.status(500).json({ error: 'Failed to load customer details' });
    }
  });

  router.get('/api/admin/transactions', adminAuth, async (req, res) => {
    try {
      const payments = await getAllPayments(ACTIVE_CAMPAIGN);
      res.json(payments);
    } catch (error) {
      console.error('Error loading transactions:', error);
      res.status(500).json({ error: 'Failed to load transactions' });
    }
  });

  router.get('/api/admin/transactions/:id', adminAuth, async (req, res) => {
    try {
      const details = await getPaymentDetails(req.params.id);
      if (!details) return res.status(404).json({ error: 'Transaction not found' });
      res.json(details);
    } catch (error) {
      console.error('Error loading transaction details:', error);
      res.status(500).json({ error: 'Failed to load transaction details' });
    }
  });

  router.get('/api/admin/failures', adminAuth, async (req, res) => {
    try {
      const failures = await getRecentFailures(50);
      res.json(failures);
    } catch (error) {
      console.error('Error loading failures:', error);
      res.status(500).json({ error: 'Failed to load failures' });
    }
  });

  router.delete('/api/admin/customers/:id', adminAuth, async (req, res) => {
    try {
      const result = await deleteCustomer(req.params.id);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (error) {
      console.error('Error deleting customer:', error);
      res.status(500).json({ error: 'Failed to delete customer' });
    }
  });

  router.post('/api/admin/customers/:id/pause', adminAuth, async (req, res) => {
    try {
      const result = await toggleCustomerStatus(req.params.id, 'paused');
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (error) {
      console.error('Error pausing customer:', error);
      res.status(500).json({ error: 'Failed to pause customer' });
    }
  });

  router.post('/api/admin/customers/:id/resume', adminAuth, async (req, res) => {
    try {
      const result = await toggleCustomerStatus(req.params.id, 'active');
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (error) {
      console.error('Error resuming customer:', error);
      res.status(500).json({ error: 'Failed to resume customer' });
    }
  });

  router.post('/api/admin/customers/:id/notes', adminAuth, async (req, res) => {
    try {
      const { notes } = req.body;
      const result = await updateCustomerNotes(req.params.id, notes);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (error) {
      console.error('Error updating notes:', error);
      res.status(500).json({ error: 'Failed to update notes' });
    }
  });

  return router;
};
