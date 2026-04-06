require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const Stripe = require('stripe');
const supabase = require('./lib/supabase');
const { loadStoreConfig } = require('./lib/store-config');
const { StoreLog, getTimestamp } = require('./lib/logger');
const { isPayPalLive, PAYPAL_CLIENT_ID } = require('./lib/paypal');
const createStripeRouter = require('./routes/stripe');
const createTokenRouter = require('./routes/token');
const createPayPalRouter = require('./routes/paypal');
const createPagesRouter = require('./routes/pages');

const app = express();
const PORT = process.env.PORT || 4000;
const CALLBACK_SECRET = process.env.CALLBACK_SECRET || 'change-me';
const STORE_DOMAIN = process.env.STORE_DOMAIN || 'localhost';

const storeConfig = loadStoreConfig();
const PAYMENT_PROCESSOR = storeConfig.paymentProcessor || 'stripe';

let stripe = null;
if (PAYMENT_PROCESSOR === 'stripe' && process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-03-31.basil'
  });
}

let storeDbId = null;

async function resolveStoreId() {
  if (!supabase) return;
  try {
    const { data } = await supabase
      .from('stores')
      .select('id')
      .eq('domain', STORE_DOMAIN)
      .maybeSingle();
    if (data) {
      storeDbId = data.id;
      return;
    }
    const { data: fallback } = await supabase
      .from('stores')
      .select('id')
      .eq('slug', process.env.STORE_ID)
      .maybeSingle();
    if (fallback) storeDbId = fallback.id;
  } catch (err) {
    StoreLog.system('\u26a0\ufe0f', `Could not resolve store ID: ${err.message}`);
  }
}

const ctx = {
  stripe, supabase, storeConfig, PAYMENT_PROCESSOR, STORE_DOMAIN, CALLBACK_SECRET,
  getStoreDbId: () => storeDbId,
};

const storeDir = path.join(__dirname, 'stores', process.env.STORE_ID || 'zenflow-tools');
app.set('view engine', 'ejs');
app.set('views', path.join(storeDir, 'views'));

app.use(createStripeRouter(ctx));

app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  req.store = storeConfig;
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const status = res.statusCode;
    if (status >= 400) {
      const ms = Date.now() - start;
      const color = status >= 500 ? '\x1b[31m' : '\x1b[33m';
      console.log(`[${getTimestamp()}] ${color}${status}\x1b[0m ${req.method} ${req.originalUrl} ${ms}ms`);
    }
  });
  next();
});

app.use('/.well-known', express.static(path.join(__dirname, 'public', '.well-known'), {
  dotfiles: 'allow',
  setHeaders: (res) => { res.set('Content-Type', 'text/plain'); }
}));

app.use(express.static(path.join(storeDir, 'public'), { index: false }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.use(createTokenRouter(ctx));
app.use(createPayPalRouter(ctx));
app.use(createPagesRouter(storeConfig));

resolveStoreId().then(() => {
  app.listen(PORT, () => {
    const processorLabel = PAYMENT_PROCESSOR === 'paypal'
      ? (PAYPAL_CLIENT_ID ? `PayPal (${isPayPalLive ? 'live' : 'sandbox'})` : 'PayPal (missing creds)')
      : (stripe ? 'Stripe Connected' : 'Stripe (missing key)');
    StoreLog.startup(PORT, storeConfig.name, STORE_DOMAIN, storeDbId, processorLabel);
  });
});
