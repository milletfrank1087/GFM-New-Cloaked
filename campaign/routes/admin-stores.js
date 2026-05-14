const express = require('express');

module.exports = function createAdminStoresRouter(ctx, adminAuth) {
  const router = express.Router();
  const { getStoreStats, getStoreDetail, createStore, updateStore, toggleStoreStatus, deleteStore, rebalanceStores } = ctx;

  router.get('/api/admin/stores', adminAuth, async (req, res) => {
    try {
      res.json(await getStoreStats());
    } catch (error) {
      console.error('[admin/stores] error:', error);
      res.status(500).json({ error: 'Failed to load stores' });
    }
  });

  router.get('/api/admin/stores/:id', adminAuth, async (req, res) => {
    try {
      const detail = await getStoreDetail(req.params.id);
      if (!detail) return res.status(404).json({ error: 'Store not found' });
      res.json(detail);
    } catch (error) {
      console.error('[admin/stores/:id] error:', error);
      res.status(500).json({ error: 'Failed to load store detail' });
    }
  });

  router.post('/api/admin/stores', adminAuth, async (req, res) => {
    try {
      const { slug, domain, name, paymentProcessor, maxMonthlyVolume, status, weightPct } = req.body;
      if (!slug || !domain || !name) {
        return res.status(400).json({ error: 'slug, domain, and name are required' });
      }
      const result = await createStore({ slug, domain, name, paymentProcessor, maxMonthlyVolume, status, weightPct });
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (error) {
      console.error('[admin/stores] create error:', error);
      res.status(500).json({ error: 'Failed to create store' });
    }
  });

  router.post('/api/admin/stores/rebalance', adminAuth, async (req, res) => {
    try {
      const { updates } = req.body || {};
      if (!Array.isArray(updates) || updates.length === 0) {
        console.warn('[admin/stores/rebalance] rejected: empty or non-array updates payload');
        return res.status(400).json({ error: 'updates must be a non-empty array of {id, weightPct, status} objects' });
      }
      console.info('[admin/stores/rebalance] applying', { count: updates.length });
      const result = await rebalanceStores(updates);
      if (!result.success) {
        console.warn('[admin/stores/rebalance] failed:', result.error);
        return res.status(400).json({ error: result.error });
      }
      console.info('[admin/stores/rebalance] succeeded', { stores: result.stores.length });
      res.json(result);
    } catch (error) {
      console.error('[admin/stores/rebalance] unexpected error:', error);
      res.status(500).json({ error: 'Failed to rebalance stores' });
    }
  });

  router.put('/api/admin/stores/:id', adminAuth, async (req, res) => {
    try {
      const result = await updateStore(req.params.id, req.body);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (error) {
      console.error('[admin/stores] update error:', error);
      res.status(500).json({ error: 'Failed to update store' });
    }
  });

  router.post('/api/admin/stores/:id/toggle', adminAuth, async (req, res) => {
    try {
      res.json(await toggleStoreStatus(req.params.id, req.body.status));
    } catch (error) {
      console.error('[admin/stores] toggle error:', error);
      res.status(500).json({ error: 'Failed to toggle store' });
    }
  });

  router.delete('/api/admin/stores/:id', adminAuth, async (req, res) => {
    try {
      const result = await deleteStore(req.params.id);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (error) {
      console.error('[admin/stores] delete error:', error);
      res.status(500).json({ error: 'Failed to delete store' });
    }
  });

  return router;
};
