const express = require('express');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const { getLayoutFingerprint } = require('./lib/layout-fingerprint.js');

const cfg = require('./stores/larkwell-home/config.js');
cfg.domain = 'larkwellhome.online';
cfg.fingerprint = getLayoutFingerprint('larkwell-home');

const pagesDir = path.join(__dirname, 'stores/larkwell-home/views/pages');
const publicDir = path.join(__dirname, 'stores/larkwell-home/public');

const renders = {
  '_preview_home.html': ['home.ejs', { store: cfg, products: cfg.products }],
  '_preview_catalog.html': ['catalog.ejs', { store: cfg, products: cfg.products, searchQuery: '' }],
  '_preview_product.html': ['product.ejs', { store: cfg, product: cfg.products[12], related: cfg.products.slice(0, 4) }],
  '_preview_cart.html': ['cart.ejs', { store: cfg }],
  '_preview_about.html': ['about.ejs', { store: cfg }],
  '_preview_checkout.html': ['checkout-store.ejs', { store: cfg, paymentProcessor: 'stripe', stripePublishableKey: 'pk_test_x' }],
};

(async () => {
  for (const [out, [file, locals]] of Object.entries(renders)) {
    const html = await ejs.renderFile(path.join(pagesDir, file), locals, { async: false });
    fs.writeFileSync(path.join(publicDir, out), html);
  }
  const app = express();
  app.use(express.static(publicDir));
  app.listen(4100, () => console.log('preview on http://localhost:4100/_preview_home.html'));
})();
