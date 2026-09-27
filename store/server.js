require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const Stripe = require('stripe');
const supabase = require('./lib/supabase');
const { loadStoreConfig } = require('./lib/store-config');
const { getLayoutFingerprint } = require('./lib/layout-fingerprint');
const { StoreLog, getTimestamp } = require('./lib/logger');
const { isPayPalLive, PAYPAL_CLIENT_ID, getPayPalAccessToken } = require('./lib/paypal');
const { emitAlert } = require('./lib/alerts');
const paymentState = require('./lib/payment-state');
const createStripeRouter = require('./routes/stripe');
const createTokenRouter = require('./routes/token');
const createPayPalRouter = require('./routes/paypal');
const createPagesRouter = require('./routes/pages');

const app = express();
const PORT = process.env.PORT || 4000;
const CALLBACK_SECRET = process.env.CALLBACK_SECRET || 'change-me';
const STORE_DOMAIN = process.env.STORE_DOMAIN || 'localhost';

const { getMeta: getCurrencyMeta } = require('./lib/currency');

const storeConfig = loadStoreConfig();
const PAYMENT_PROCESSOR = storeConfig.paymentProcessor || 'stripe';
storeConfig.fingerprint = getLayoutFingerprint(process.env.STORE_ID || 'haven-prints');

const _storeCurrencyMeta = getCurrencyMeta(storeConfig.currency || 'EUR');
storeConfig.currencyDecimals = _storeCurrencyMeta.decimals;
storeConfig.currencyPosition = _storeCurrencyMeta.position;
if (!storeConfig.currencySymbol) storeConfig.currencySymbol = _storeCurrencyMeta.symbol;

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
  paymentState,
  emitAlert
};

const storeDir = path.join(__dirname, 'stores', process.env.STORE_ID || 'zenflow-tools');
const sharedViewsDir = path.join(__dirname, 'views');
app.set('view engine', 'ejs');
app.set('views', [path.join(storeDir, 'views'), sharedViewsDir]);

app.use(cookieParser());
// Log context: which visitor (campaign visitor id) and market each request belongs to.
app.use(StoreLog.contextMiddleware((req) => {
  if (req.cookies.__session) {
    const s = JSON.parse(req.cookies.__session);
    return { vid: s.utm && s.utm.visitorId, mkt: s.utm && s.utm.market };
  }
  const offer = require('./lib/upsell').readOfferToken(req.cookies.__upsell);
  return offer ? { vid: offer.vid, mkt: offer.mkt } : {};
}));
app.use((req, res, next) => {
  if (req.originalUrl === '/webhooks/stripe') return next();
  express.json()(req, res, next);
});

app.use(createStripeRouter(ctx));

app.use((req, res, next) => {
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  req.store = storeConfig;
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const status = res.statusCode;
    // 404s are almost all vulnerability scanners (/.env, /.git/config…): counted in the hourly summary.
    if (status === 404) { StoreLog.scannerHit(); return; }
    if (status >= 500 || (status >= 400 && req.originalUrl.startsWith('/api/'))) {
      const ms = Date.now() - start;
      StoreLog.system(status >= 500 ? '💥' : '⚠️', `HTTP ${status} ${req.method} ${req.originalUrl.split('?')[0]} (${ms}ms)`);
    }
  });
  next();
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/healthz', async (req, res) => {
  const checks = { processor: PAYMENT_PROCESSOR, supabase: 'unknown', stripe: 'unknown', paypal: 'unknown' };
  let healthy = true;

  try {
    if (supabase) {
      const { error } = await supabase.from('stores').select('id').limit(1);
      checks.supabase = error ? `error: ${error.message}` : 'ok';
      if (error) healthy = false;
    } else {
      checks.supabase = 'not-configured';
    }
  } catch (err) {
    checks.supabase = `exception: ${err.message}`;
    healthy = false;
  }

  if (PAYMENT_PROCESSOR === 'stripe') {
    try {
      if (!stripe) { checks.stripe = 'not-configured'; healthy = false; }
      else {
        await stripe.balance.retrieve();
        checks.stripe = 'ok';
      }
    } catch (err) {
      checks.stripe = `${err.code || err.type || 'error'}: ${err.message}`;
      healthy = false;
    }
  } else if (PAYMENT_PROCESSOR === 'paypal') {
    try {
      if (!PAYPAL_CLIENT_ID) { checks.paypal = 'not-configured'; healthy = false; }
      else {
        await getPayPalAccessToken();
        checks.paypal = 'ok';
      }
    } catch (err) {
      checks.paypal = `error: ${err.message}`;
      healthy = false;
    }
  }

  const failFast = paymentState.getFailFast();
  res.status(healthy ? 200 : 503).json({
    healthy, checks, failFast, storeId: process.env.STORE_ID, domain: STORE_DOMAIN, ts: new Date().toISOString()
  });
});

app.get('/.well-known/apple-developer-merchantid-domain-association', (req, res) => {
  const content = process.env.APPLE_PAY_DOMAIN_ASSOCIATION;
  if (content) {
    res.set('Content-Type', 'text/plain');
    return res.send(content);
  }
  const localPath = path.join(__dirname, 'public', '.well-known', 'apple-developer-merchantid-domain-association');
  if (fs.existsSync(localPath)) {
    res.set('Content-Type', 'text/plain');
    return res.sendFile(localPath);
  }
  res.status(404).send('Not configured. Set APPLE_PAY_DOMAIN_ASSOCIATION env var (per-deploy, account-bound).');
});

app.use(express.static(path.join(storeDir, 'public'), { index: false }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.use(createTokenRouter(ctx));
app.use(createPayPalRouter(ctx));
app.use(createPagesRouter(storeConfig));

async function verifyProcessorBootHealth() {
  if (PAYMENT_PROCESSOR === 'stripe' && stripe) {
    try {
      await stripe.balance.retrieve();
      paymentState.setStripeBootHealth(true);
      StoreLog.system('\u2705', 'Stripe API key verified at boot (balance.retrieve OK)');
    } catch (err) {
      paymentState.setStripeBootHealth(false, err);
      paymentState.tripFailFast({
        errClass: 'operator',
        code: err.code || err.type || 'boot_check_failed',
        message: err.message,
        ttlMs: 60 * 1000
      });
      StoreLog.error('payment_failed', '---', `BOOT_CHECK ${err.code || err.type}: ${err.message}`);
      emitAlert({
        key: `stripe-boot-${err.code || err.type || 'unknown'}`,
        title: 'Stripe boot health check FAILED',
        severity: 'critical',
        context: {
          code: err.code || 'unknown',
          type: err.type || err.constructor?.name || 'Unknown',
          message: err.message,
          hint: 'Roll a new sk_live_* key and update STRIPE_SECRET_KEY env var'
        }
      });
    }
  }
  if (PAYMENT_PROCESSOR === 'paypal' && PAYPAL_CLIENT_ID) {
    try {
      await getPayPalAccessToken();
      paymentState.setPayPalBootHealth(true);
      StoreLog.system('\u2705', 'PayPal credentials verified at boot');
    } catch (err) {
      paymentState.setPayPalBootHealth(false, err);
      emitAlert({
        key: 'paypal-boot-failed',
        title: 'PayPal boot health check FAILED',
        severity: 'critical',
        context: { message: err.message, hint: 'Verify PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET env vars' }
      });
    }
  }
}

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

resolveStoreId().then(() => {
  app.listen(PORT, () => {
    const processorLabel = PAYMENT_PROCESSOR === 'paypal'
      ? (PAYPAL_CLIENT_ID ? `PayPal (${isPayPalLive ? 'live' : 'sandbox'})` : 'PayPal (missing creds)')
      : (stripe ? 'Stripe Connected' : 'Stripe (missing key)');
    StoreLog.startup(PORT, storeConfig.name, STORE_DOMAIN, storeDbId, processorLabel);
    verifyProcessorBootHealth();
  });
});
