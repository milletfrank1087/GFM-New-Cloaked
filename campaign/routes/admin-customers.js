const express = require('express');

module.exports = function createAdminCustomersRouter(ctx, adminAuth) {
  const router = express.Router();
  const {
    getAllCustomers,
    getCustomerDetails,
    deleteCustomer,
    toggleCustomerStatus,
    updateCustomerNotes
  } = ctx;

  router.get('/api/admin/customers', adminAuth, async (req, res) => {
    try {
      res.json(await getAllCustomers());
    } catch (error) {
      console.error('[admin/customers] error:', error);
      res.status(500).json({ error: 'Failed to load customers' });
    }
  });

  router.get('/api/admin/customers/:id', adminAuth, async (req, res) => {
    try {
      const details = await getCustomerDetails(req.params.id);
      if (!details) return res.status(404).json({ error: 'Customer not found' });
      res.json(details);
    } catch (error) {
      console.error('[admin/customers/:id] error:', error);
      res.status(500).json({ error: 'Failed to load customer details' });
    }
  });

  router.delete('/api/admin/customers/:id', adminAuth, async (req, res) => {
    try {
      const result = await deleteCustomer(req.params.id);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (error) {
      console.error('[admin/customers] delete error:', error);
      res.status(500).json({ error: 'Failed to delete customer' });
    }
  });

  router.post('/api/admin/customers/:id/pause', adminAuth, async (req, res) => {
    try {
      const result = await toggleCustomerStatus(req.params.id, 'paused');
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (error) {
      console.error('[admin/customers] pause error:', error);
      res.status(500).json({ error: 'Failed to pause customer' });
    }
  });

  router.post('/api/admin/customers/:id/resume', adminAuth, async (req, res) => {
    try {
      const result = await toggleCustomerStatus(req.params.id, 'active');
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (error) {
      console.error('[admin/customers] resume error:', error);
      res.status(500).json({ error: 'Failed to resume customer' });
    }
  });

  router.post('/api/admin/customers/:id/notes', adminAuth, async (req, res) => {
    try {
      const result = await updateCustomerNotes(req.params.id, req.body.notes);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (error) {
      console.error('[admin/customers] notes error:', error);
      res.status(500).json({ error: 'Failed to update notes' });
    }
  });

  return router;
};
