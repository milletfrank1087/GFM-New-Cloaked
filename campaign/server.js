require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const {
  getRecentRealDonations,
  getCampaignRealStats,
  getAllCustomers,
  getCustomerDetails,
  getAllPayments,
  getPaymentDetails,
  getAdminDashboardStats,
  getRecentFailures,
  deleteCustomer,
  toggleCustomerStatus,
  updateCustomerNotes,
  getTimeBasedAnalytics,
  getDeviceBrowserAnalytics,
  getDashboardOverview,
  getProfitOverview,
  getChartTimeline,
  getAbTestMetrics,
  resetAbTestData,
  triggerAdSync,
  syncAll,
  createDonationToken,
  getNextStore,
  getStoreStats,
  getStoreDetail,
  createStore,
  updateStore,
  toggleStoreStatus,
  deleteStore,
  rebalanceStores
} = require('./lib/supabase');
const {
  trackEvent,
  trackPurchase,
  trackSubscribe,
  getTrackingConfig,
  isTrackingEnabled
} = require('./lib/tracking');
const { createJourneyLog } = require('./lib/logger');
const { visitors, getOrCreateVisitor } = require('./lib/visitors');
const { startBackgroundSyncWorker } = require('./lib/ads-manager');

const createPublicRouter = require('./routes/public');
const createDonationRouter = require('./routes/donation');
const createAdminRouter = require('./routes/admin');
const createPagesRouter = require('./routes/pages');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'hoperise-admin-secret-key';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const CALLBACK_SECRET = process.env.CALLBACK_SECRET || 'change-me';

const ACTIVE_CAMPAIGN = process.env.ACTIVE_CAMPAIGN || 'glioblastoma-grace';
const MERCHANT_COUNTRY = process.env.MERCHANT_COUNTRY || 'GR';
const DEFAULT_LANGUAGE = process.env.DEFAULT_LANGUAGE || 'en';

const CURRENCY = process.env.CURRENCY || 'USD';
const CURRENCY_CONFIG = {
  USD: { code: 'USD', symbol: '$',  position: 'before', locale: 'en-US', decimals: 2, stripeMin: 0.50, presetAmounts: [10, 25, 50, 100, 250, 500], defaultAmount: 50 },
  EUR: { code: 'EUR', symbol: '€',  position: 'before', locale: 'it-IT', decimals: 2, stripeMin: 0.50, presetAmounts: [10, 25, 50, 100, 250, 500], defaultAmount: 50 },
  GBP: { code: 'GBP', symbol: '£',  position: 'before', locale: 'en-GB', decimals: 2, stripeMin: 0.30, presetAmounts: [10, 25, 50, 100, 250, 500], defaultAmount: 50 },
  PLN: { code: 'PLN', symbol: 'zł', position: 'after',  locale: 'pl-PL', decimals: 2, stripeMin: 2.00, presetAmounts: [40, 100, 200, 500, 1000, 2000], defaultAmount: 200 },
  CHF: { code: 'CHF', symbol: 'CHF', position: 'before', locale: 'de-CH', decimals: 2, stripeMin: 0.50, presetAmounts: [10, 25, 50, 100, 250, 500], defaultAmount: 50 },
  SEK: { code: 'SEK', symbol: 'kr', position: 'after',  locale: 'sv-SE', decimals: 2, stripeMin: 3.00, presetAmounts: [50, 100, 250, 500, 1000, 2500], defaultAmount: 500 },
  NOK: { code: 'NOK', symbol: 'kr', position: 'after',  locale: 'nb-NO', decimals: 2, stripeMin: 3.00, presetAmounts: [50, 100, 250, 500, 1000, 2500], defaultAmount: 500 },
  DKK: { code: 'DKK', symbol: 'kr', position: 'after',  locale: 'da-DK', decimals: 2, stripeMin: 2.50, presetAmounts: [50, 100, 250, 500, 1000, 2500], defaultAmount: 350 },
  CZK: { code: 'CZK', symbol: 'Kč', position: 'after',  locale: 'cs-CZ', decimals: 2, stripeMin: 15.00, presetAmounts: [200, 500, 1000, 2500, 5000, 10000], defaultAmount: 1000 },
  HUF: { code: 'HUF', symbol: 'Ft', position: 'after',  locale: 'hu-HU', decimals: 2, stripeMin: 175.00, presetAmounts: [2000, 5000, 10000, 25000, 50000, 100000], defaultAmount: 15000 },
  RON: { code: 'RON', symbol: 'lei', position: 'after', locale: 'ro-RO', decimals: 2, stripeMin: 2.00, presetAmounts: [50, 100, 250, 500, 1000, 2500], defaultAmount: 200 },
  CAD: { code: 'CAD', symbol: 'CA$', position: 'before', locale: 'en-CA', decimals: 2, stripeMin: 0.50, presetAmounts: [10, 25, 50, 100, 250, 500], defaultAmount: 50 },
  AUD: { code: 'AUD', symbol: 'A$', position: 'before', locale: 'en-AU', decimals: 2, stripeMin: 0.50, presetAmounts: [10, 25, 50, 100, 250, 500], defaultAmount: 50 },
  NZD: { code: 'NZD', symbol: 'NZ$', position: 'before', locale: 'en-NZ', decimals: 2, stripeMin: 0.50, presetAmounts: [10, 25, 50, 100, 250, 500], defaultAmount: 50 },
  BRL: { code: 'BRL', symbol: 'R$', position: 'before', locale: 'pt-BR', decimals: 2, stripeMin: 0.50, presetAmounts: [25, 50, 100, 250, 500, 1000], defaultAmount: 100 },
  MXN: { code: 'MXN', symbol: 'MX$', position: 'before', locale: 'es-MX', decimals: 2, stripeMin: 10.00, presetAmounts: [100, 250, 500, 1000, 2500, 5000], defaultAmount: 500 },
  JPY: { code: 'JPY', symbol: '¥',  position: 'before', locale: 'ja-JP', decimals: 0, stripeMin: 50, presetAmounts: [1000, 3000, 5000, 10000, 25000, 50000], defaultAmount: 5000 },
};
const ACTIVE_CURRENCY = CURRENCY_CONFIG[CURRENCY] || CURRENCY_CONFIG.USD;

function fmtCurrency(amount) {
  const s = ACTIVE_CURRENCY.symbol;
  return ACTIVE_CURRENCY.position === 'after' ? `${amount}${s}` : `${s}${amount}`;
}

// Market code shown in every log line (IT, PT, UK…); override with MARKET_CODE.
const MARKET_CODE = process.env.MARKET_CODE || ({ it: 'IT', pt: 'PT', es: 'ES', fr: 'FR', el: 'GR', pl: 'PL' }[DEFAULT_LANGUAGE])
  || ({ GBP: 'UK', USD: 'US' }[CURRENCY]) || String(DEFAULT_LANGUAGE).toUpperCase();
const JourneyLog = createJourneyLog(fmtCurrency, { market: MARKET_CODE });

function generateFBP() {
  const timestamp = Date.now();
  const high = Math.floor(Math.random() * 1e10);
  const low = Math.floor(Math.random() * 1e9);
  const random = `${high}${low.toString().padStart(9, '0')}`;
  return `fb.1.${timestamp}.${random}`;
}

function getAllCampaignFiles(dir) {
  const campaignsDir = dir || path.join(__dirname, 'campaigns');
  let results = [];
  const entries = fs.readdirSync(campaignsDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(campaignsDir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getAllCampaignFiles(fullPath));
    } else if (entry.name.endsWith('.json')) {
      results.push(fullPath);
    }
  }
  return results;
}

function loadCampaignFromFile(campaignSlug) {
  const campaignsDir = path.join(__dirname, 'campaigns');
  const allFiles = getAllCampaignFiles(campaignsDir);
  const match = allFiles.find(f => path.basename(f) === `${campaignSlug}.json`);
  if (!match) return null;
  return JSON.parse(fs.readFileSync(match, 'utf-8'));
}

let geoip = null;
if (process.env.ENABLE_GEOIP_LITE === 'true') {
  try { geoip = require('geoip-lite'); } catch (e) { console.warn('[geo] geoip-lite unavailable:', e.message); }
}

// Edge header or optional offline GeoIP lookup on the connection IP.
function lookupLocation(ip, req) {
  const edgeCountry = (req?.headers?.['x-zeabur-ip-country'] || req?.headers?.['cf-ipcountry'] || '').trim().toUpperCase();
  if (edgeCountry && edgeCountry !== 'XX') {
    return { ip: ip || 'unknown', city: null, region: null, country: null, countryCode: edgeCountry };
  }
  if (!geoip || !ip || ip === 'unknown') return null;
  const hit = geoip.lookup(ip);
  if (!hit || !hit.country) return null;
  return { ip, city: hit.city || null, region: hit.region || null, country: null, countryCode: hit.country };
}

function getClientInfo(req) {
  let ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.ip ||
           req.connection?.remoteAddress ||
           req.body?.clientLocation?.ip ||
           'unknown';
  ip = ip.replace(/^::ffff:/, '');

  const clientLocation = req.body?.clientLocation?.countryCode
    ? req.body.clientLocation
    : lookupLocation(ip, req);

  return {
    ipAddress: ip,
    userAgent: req.headers['user-agent'] || 'unknown',
    referer: req.headers.referer || req.headers.referrer || 'direct',
    clientLocation
  };
}

// API failures and slow API calls (pages/static files are not logged; 404s are mostly scanners).
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    if (status >= 500 || (status >= 400 && status !== 404)) {
      JourneyLog.system(status >= 500 ? '💥' : '⚠️', `HTTP ${status} ${req.method} ${req.path} (${ms}ms)`);
    } else if (ms > 3000) {
      JourneyLog.system('🐢', `slow ${req.method} ${req.path} took ${ms}ms`);
    }
  });
  next();
});

app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  if (!req.cookies._fbp) {
    const fbp = generateFBP();
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('_fbp', fbp, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: false,
      secure: isProd,
      sameSite: isProd ? 'None' : 'Lax',
      path: '/'
    });
    req.cookies._fbp = fbp;
  }
  next();
});

app.use('/locales', express.static(path.join(__dirname, 'locales'), {
  setHeaders: (res) => {
    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', 'public, max-age=3600');
  }
}));

app.use(express.static(path.join(__dirname, 'public'), {
  index: false
}));

let cachedCampaignJSON = null;

const ctx = {
  ACTIVE_CAMPAIGN,
  ACTIVE_CURRENCY,
  MERCHANT_COUNTRY,
  DEFAULT_LANGUAGE,
  JWT_SECRET,
  ADMIN_PASSWORD,
  CALLBACK_SECRET,
  JourneyLog,
  fmtCurrency,
  visitors,
  getOrCreateVisitor,
  getClientInfo,
  loadCampaignFromFile,
  getAllCampaignFiles: () => getAllCampaignFiles(),
  getTrackingConfig,
  isTrackingEnabled,
  trackEvent,
  trackPurchase,
  trackSubscribe,
  getRecentRealDonations,
  getCampaignRealStats,
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
  getDashboardOverview,
  getProfitOverview,
  getChartTimeline,
  getAbTestMetrics,
  resetAbTestData,
  triggerAdSync,
  syncAll,
  createDonationToken,
  getNextStore,
  getStoreStats,
  getStoreDetail,
  createStore,
  updateStore,
  toggleStoreStatus,
  deleteStore,
  rebalanceStores,
  getCachedCampaignJSON: () => cachedCampaignJSON
};

app.use(createPublicRouter(ctx));
app.use(createDonationRouter(ctx));
app.use(createAdminRouter(ctx));
app.use(createPagesRouter(ctx));

function seedCampaignCacheFromFile() {
  const campaign = loadCampaignFromFile(ACTIVE_CAMPAIGN);
  if (campaign && !cachedCampaignJSON) {
    cachedCampaignJSON = JSON.stringify(campaign);
  }
  return campaign;
}

async function refreshCampaignCache() {
  try {
    const campaign = seedCampaignCacheFromFile();
    if (!campaign) return;

    let realStats = { realRaised: 0, realDonorCount: 0 };
    try {
      const [, stats] = await Promise.race([
        Promise.all([
          getRecentRealDonations(ACTIVE_CAMPAIGN, 20),
          getCampaignRealStats(ACTIVE_CAMPAIGN)
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
      ]);
      realStats = stats;
    } catch (_) {}

    cachedCampaignJSON = JSON.stringify({
      ...campaign,
      raised: Math.round((campaign.raised || 0) + realStats.realRaised),
      donorCount: (campaign.donorCount || 0) + realStats.realDonorCount,
      _realStats: { realRaised: realStats.realRaised, realDonorCount: realStats.realDonorCount }
    });
  } catch (e) {
    seedCampaignCacheFromFile();
  }
}

process.on('uncaughtException', (err) => {
  console.error('[CAMPAIGN UNCAUGHT EXCEPTION]', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CAMPAIGN UNHANDLED REJECTION]', reason);
});

seedCampaignCacheFromFile();
const cacheJitterMs = 8000 + Math.floor(Math.random() * 20000);
setTimeout(() => {
  refreshCampaignCache();
  setInterval(refreshCampaignCache, 60000);
}, cacheJitterMs);
startBackgroundSyncWorker();

app.listen(PORT, () => {
  const trackingConfig = getTrackingConfig();
  let trackingStatus = 'DISABLED';
  if (trackingConfig.enabled) {
    const platforms = [];
    if (trackingConfig.fbPixelId) platforms.push('Meta');
    if (trackingConfig.tiktokPixelId) platforms.push('TikTok');
    trackingStatus = platforms.join(' + ') + ' (ENABLED)';
  }
  const langMap = { el: 'Greek', it: 'Italian', pt: 'Portuguese', pl: 'Polish', es: 'Spanish', fr: 'French', en: 'English' };
  const langDisplay = `${langMap[DEFAULT_LANGUAGE] || DEFAULT_LANGUAGE} (${DEFAULT_LANGUAGE})`;
  JourneyLog.startup(PORT, ACTIVE_CAMPAIGN, `${ACTIVE_CURRENCY.code} (${ACTIVE_CURRENCY.symbol})`, langDisplay, trackingStatus);
});
