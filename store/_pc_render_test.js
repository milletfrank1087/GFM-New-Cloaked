const ejs = require('ejs');
const { getLayoutFingerprint } = require('./lib/layout-fingerprint.js');
const cfg = require('./stores/precious-couture/config.js');
cfg.domain = 'www.preciouscouture.online';
cfg.fingerprint = getLayoutFingerprint('precious-couture');
const base = './stores/precious-couture/views/pages/';
const tests = [
  ['home.ejs', { store: cfg, products: cfg.products }],
  ['catalog.ejs', { store: cfg, products: cfg.products, searchQuery: '' }],
  ['product.ejs', { store: cfg, product: cfg.products[0], related: cfg.products.slice(1, 5) }],
];
(async () => {
  let ok = true;
  for (const [p, l] of tests) {
    const h = await ejs.renderFile(base + p, l, { async: false });
    const literal = h.includes('${sym}');
    const dollarSpans = (h.match(/>\$\d+\.\d{2}</g) || []).length;
    if (literal || dollarSpans === 0) ok = false;
    console.log(p, '| literal-sym:', literal, '| $-price spans:', dollarSpans);
  }
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
