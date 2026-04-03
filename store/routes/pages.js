const express = require('express');
const router = express.Router();

module.exports = function createPagesRouter(storeConfig) {
  router.get('/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nAllow: /\n');
  });

  router.get('/', (req, res) => {
    res.render('pages/home', { store: req.store, products: storeConfig.products || [] });
  });

  router.get('/products', (req, res) => {
    res.render('pages/catalog', { store: req.store, products: storeConfig.products || [] });
  });

  router.get('/search', (req, res) => {
    const q = (req.query.q || '').toLowerCase().trim();
    const products = storeConfig.products || [];
    const results = q ? products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    ) : products;
    res.render('pages/catalog', { store: req.store, products: results, searchQuery: q });
  });

  router.get('/products/:slug', (req, res) => {
    const products = storeConfig.products || [];
    const product = products.find(p => p.slug === req.params.slug);
    if (!product) return res.redirect('/products');
    const related = products.filter(p => p.slug !== product.slug).slice(0, 4);
    res.render('pages/product', { store: req.store, product, related });
  });

  router.get('/about', (req, res) => res.render('pages/about', { store: req.store }));
  router.get('/contact', (req, res) => res.render('pages/contact', { store: req.store }));
  router.get('/terms', (req, res) => res.render('pages/terms', { store: req.store }));
  router.get('/privacy', (req, res) => res.render('pages/privacy', { store: req.store }));
  router.get('/faq', (req, res) => res.render('pages/faq', { store: req.store }));
  router.get('/cart', (req, res) => res.render('pages/cart', { store: req.store }));

  return router;
};
