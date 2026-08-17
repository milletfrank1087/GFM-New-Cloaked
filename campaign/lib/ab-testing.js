const { supabase, fetchRates, convertToBase } = require('./db/client');
const { parseUserAgent } = require('./userAgentParser');

const VARIANTS = {
  CONTROL: 'control',
  VARIANT_B: 'variant_b'
};

const VARIANT_NAMES = {
  control: 'Original Template (Control)',
  variant_b: 'Human-Authentic (Variant B)'
};

const COOKIE_NAME = '_ab_variant';
const SID_COOKIE_NAME = '_ab_sid';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

// Maximum in-memory visitor logs to prevent memory leaks
const MAX_VISITOR_SESSIONS = 10000;

// In-memory visitor sessions ring buffer & lookup
const visitorSessions = [];
const visitorSessionMap = new Map();

// In-memory IP Geolocation Cache
const ipGeoCache = new Map();

// Optional reset checkpoint
let abResetTimestamp = 0;

function resetAbTestData() {
  visitorSessions.length = 0;
  visitorSessionMap.clear();
  ipGeoCache.clear();
  abResetTimestamp = Date.now();
  return { ok: true, resetAt: new Date(abResetTimestamp).toISOString() };
}

function isPrivateIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  const clean = ip.replace(/^::ffff:/, '').trim();
  if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost' || clean === 'unknown') return true;
  if (clean.startsWith('10.') || clean.startsWith('192.168.') || clean.startsWith('172.16.') || clean.startsWith('172.31.')) return true;
  if (clean.startsWith('fc00:') || clean.startsWith('fe80:')) return true;
  return false;
}

function isInternalVisitor(cleanIp, req) {
  if (isPrivateIp(cleanIp)) return true;
  if (req?.cookies?.admin_token) return true;
  if (req?.headers?.['x-is-admin']) return true;
  const envInternal = process.env.INTERNAL_IPS;
  if (envInternal && envInternal.split(',').map(s => s.trim()).includes(cleanIp)) {
    return true;
  }
  return false;
}

async function resolveIpLocation(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') {
    return { country: 'Unknown', countryCode: '', city: '', locationLabel: 'Unknown Location' };
  }
  const cleanIp = rawIp.replace(/^::ffff:/, '').trim();

  if (isPrivateIp(cleanIp)) {
    return { country: 'Local Network', countryCode: 'LOCAL', city: 'Internal', locationLabel: 'Local / Internal' };
  }

  if (ipGeoCache.has(cleanIp)) {
    return ipGeoCache.get(cleanIp);
  }

  // 1. Primary: ip-api.com
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://ip-api.com/json/${cleanIp}?fields=status,country,countryCode,regionName,city,query`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CampaignServer/1.0' }
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'success') {
        const parts = [data.city, data.regionName, data.country].filter(Boolean);
        const geo = {
          country: data.country || 'Unknown',
          countryCode: data.countryCode || '',
          city: data.city || '',
          locationLabel: parts.length > 0 ? parts.join(', ') : (data.country || 'Unknown')
        };
        ipGeoCache.set(cleanIp, geo);
        return geo;
      }
    }
  } catch (err) {
    // Failover to secondary provider
  }

  // 2. Secondary fallback: ipapi.co
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`https://ipapi.co/${cleanIp}/json/`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CampaignServer/1.0' }
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.country_name) {
        const parts = [data.city, data.region, data.country_name].filter(Boolean);
        const geo = {
          country: data.country_name || 'Unknown',
          countryCode: data.country_code || '',
          city: data.city || '',
          locationLabel: parts.length > 0 ? parts.join(', ') : (data.country_name || 'Unknown')
        };
        ipGeoCache.set(cleanIp, geo);
        return geo;
      }
    }
  } catch (err) {
    // Fallback default
  }

  const fallback = { country: 'Unknown', countryCode: '', city: '', locationLabel: 'Unknown Location' };
  ipGeoCache.set(cleanIp, fallback);
  return fallback;
}

function formatDeviceLabel(uaInfo) {
  const osName = uaInfo.os ? uaInfo.os.charAt(0).toUpperCase() + uaInfo.os.slice(1) : 'OS';
  const browserName = uaInfo.browser ? uaInfo.browser.charAt(0).toUpperCase() + uaInfo.browser.slice(1) : 'Browser';
  
  if (uaInfo.deviceType === 'mobile') {
    if (uaInfo.os === 'ios') return `iPhone (${osName}) - ${browserName}`;
    if (uaInfo.os === 'android') return `Android - ${browserName}`;
    return `Mobile (${osName}) - ${browserName}`;
  } else if (uaInfo.deviceType === 'tablet') {
    return `Tablet (${osName}) - ${browserName}`;
  } else {
    return `Desktop (${osName}) - ${browserName}`;
  }
}

function formatDuration(seconds) {
  const s = Math.round(seconds || 0);
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const remSec = s % 60;
  return `${mins}m ${remSec}s`;
}

function formatRelativeTime(epochMs) {
  const diffSec = Math.max(0, Math.round((Date.now() - epochMs) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function resolveVariant(req, res) {
  const queryVariant = req.query.variant || req.query.ab;
  if (queryVariant) {
    const normalized = queryVariant.toLowerCase();
    if (normalized === 'b' || normalized === 'variant_b' || normalized === '2') {
      setVariantCookie(res, VARIANTS.VARIANT_B);
      return VARIANTS.VARIANT_B;
    }
    if (normalized === 'control' || normalized === 'a' || normalized === '1' || normalized === 'original') {
      setVariantCookie(res, VARIANTS.CONTROL);
      return VARIANTS.CONTROL;
    }
  }

  const existingCookie = req.cookies?.[COOKIE_NAME];
  if (existingCookie && (existingCookie === VARIANTS.CONTROL || existingCookie === VARIANTS.VARIANT_B)) {
    return existingCookie;
  }

  const assigned = Math.random() < 0.5 ? VARIANTS.CONTROL : VARIANTS.VARIANT_B;
  setVariantCookie(res, assigned);
  return assigned;
}

function setVariantCookie(res, variant) {
  if (!res || !res.cookie) return;
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, variant, {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? 'None' : 'Lax',
    path: '/'
  });
}

function getOrSetSessionId(req, res) {
  let sid = req.cookies?.[SID_COOKIE_NAME];
  if (!sid) {
    sid = 'sid_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    if (res && res.cookie) {
      const isProd = process.env.NODE_ENV === 'production';
      res.cookie(SID_COOKIE_NAME, sid, {
        maxAge: COOKIE_MAX_AGE,
        httpOnly: false,
        secure: isProd,
        sameSite: isProd ? 'None' : 'Lax',
        path: '/'
      });
    }
  }
  return sid;
}

function cleanIpAddress(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return 'Unknown';
  return rawIp.replace(/^::ffff:/, '').trim();
}

function recordImpression(variant, userAgent = '', ip = '', campaignSlug = 'glioblastoma-grace', req = null, res = null) {
  const cleanIp = cleanIpAddress(ip);

  // Ignore internal/developer/admin traffic
  if (isInternalVisitor(cleanIp, req)) {
    return null;
  }

  const sid = req ? getOrSetSessionId(req, res) : `ip_${ip}`;
  const sessionKey = `${sid}_${variant}`;
  const uaInfo = parseUserAgent(userAgent);
  const now = Date.now();

  let session = visitorSessionMap.get(sessionKey);
  if (!session) {
    session = {
      id: sid,
      key: sessionKey,
      timestamp: now,
      createdAt: new Date(now).toISOString(),
      variant: variant === VARIANTS.VARIANT_B ? VARIANTS.VARIANT_B : VARIANTS.CONTROL,
      campaignSlug: campaignSlug || 'glioblastoma-grace',
      ip: cleanIp,
      userAgent: userAgent || '',
      uaInfo: uaInfo,
      deviceType: uaInfo.deviceType,
      isMobile: uaInfo.isMobile || uaInfo.deviceType === 'mobile',
      deviceLabel: formatDeviceLabel(uaInfo),
      locationLabel: 'Resolving…',
      city: '',
      country: '',
      countryCode: '',
      stayTime: 0,
      scrollDepth: 0,
      checkoutOpened: false,
      checkoutInitiated: false,
      donated: false,
      amount: 0,
      currency: 'GBP',
      paymentId: null
    };

    visitorSessionMap.set(sessionKey, session);
    visitorSessions.unshift(session); // Newest first

    if (visitorSessions.length > MAX_VISITOR_SESSIONS) {
      const removed = visitorSessions.pop();
      if (removed) visitorSessionMap.delete(removed.key);
    }

    // Resolve IP geolocation in background
    resolveIpLocation(cleanIp).then(geo => {
      session.locationLabel = geo.locationLabel;
      session.city = geo.city;
      session.country = geo.country;
      session.countryCode = geo.countryCode;
    }).catch(() => {
      session.locationLabel = 'Unknown Location';
    });
  }
  return session;
}

function recordEngagementEvent(variant, eventName, data = {}, ip = '', req = null) {
  const cleanIp = cleanIpAddress(ip);
  if (isInternalVisitor(cleanIp, req)) {
    return;
  }

  const sid = req?.cookies?.[SID_COOKIE_NAME] || data.sid || `ip_${ip}`;
  const sessionKey = `${sid}_${variant}`;
  let session = visitorSessionMap.get(sessionKey);

  // Fallback find by IP and variant in top 100 recent sessions if cookie not found
  if (!session && cleanIp) {
    for (let i = 0; i < Math.min(100, visitorSessions.length); i++) {
      if (visitorSessions[i].ip === cleanIp && visitorSessions[i].variant === variant) {
        session = visitorSessions[i];
        break;
      }
    }
  }

  if (session) {
    if (eventName === 'stay_time') {
      const seconds = Math.min(3600, Math.max(1, parseFloat(data.seconds || 0)));
      if (seconds > session.stayTime) {
        session.stayTime = seconds;
      }
    } else if (eventName === 'checkout_open') {
      session.checkoutOpened = true;
    } else if (eventName === 'checkout_initiated' || eventName === 'init_checkout') {
      session.checkoutOpened = true;
      session.checkoutInitiated = true;
    } else if (eventName === 'scroll_depth') {
      const depth = parseInt(data.depth || 0, 10);
      if (depth > session.scrollDepth) {
        session.scrollDepth = depth;
      }
    }
  }
}

function calculateDateBounds(dateRange, rangeKey, tzOffset = 0) {
  const now = new Date();
  
  if (dateRange?.startDate && dateRange?.endDate) {
    const start = new Date(dateRange.startDate).getTime();
    let end = new Date(dateRange.endDate).getTime();
    if (dateRange.endDate.includes('00:00:00') || /^\d{4}-\d{2}-\d{2}$/.test(dateRange.endDate)) {
      end += 86400000 - 1;
    }
    return {
      startTime: Number.isNaN(start) ? 0 : start,
      endTime: Number.isNaN(end) ? Date.now() + 86400000 : end,
      startDateISO: new Date(start).toISOString(),
      endDateISO: new Date(end).toISOString()
    };
  }

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (rangeKey) {
    case 'today': {
      const start = todayMidnight.getTime();
      const end = now.getTime();
      return {
        startTime: start,
        endTime: end,
        startDateISO: new Date(start).toISOString(),
        endDateISO: new Date(end).toISOString()
      };
    }
    case 'yesterday': {
      const start = todayMidnight.getTime() - 86400000;
      const end = todayMidnight.getTime() - 1;
      return {
        startTime: start,
        endTime: end,
        startDateISO: new Date(start).toISOString(),
        endDateISO: new Date(end).toISOString()
      };
    }
    case 'last7days': {
      const start = todayMidnight.getTime() - 6 * 86400000;
      const end = now.getTime();
      return {
        startTime: start,
        endTime: end,
        startDateISO: new Date(start).toISOString(),
        endDateISO: new Date(end).toISOString()
      };
    }
    case 'last30days': {
      const start = todayMidnight.getTime() - 29 * 86400000;
      const end = now.getTime();
      return {
        startTime: start,
        endTime: end,
        startDateISO: new Date(start).toISOString(),
        endDateISO: new Date(end).toISOString()
      };
    }
    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const end = now.getTime();
      return {
        startTime: start,
        endTime: end,
        startDateISO: new Date(start).toISOString(),
        endDateISO: new Date(end).toISOString()
      };
    }
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const end = new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1;
      return {
        startTime: start,
        endTime: end,
        startDateISO: new Date(start).toISOString(),
        endDateISO: new Date(end).toISOString()
      };
    }
    case 'allTime':
    default: {
      return {
        startTime: abResetTimestamp > 0 ? abResetTimestamp : 0,
        endTime: Date.now() + 86400000,
        startDateISO: new Date(abResetTimestamp > 0 ? abResetTimestamp : 0).toISOString(),
        endDateISO: new Date(Date.now() + 86400000).toISOString()
      };
    }
  }
}

function calculateZScore(conversionsA, visitorsA, conversionsB, visitorsB) {
  if (visitorsA <= 0 || visitorsB <= 0) {
    return { zScore: 0, pValue: 1, confidence: 0, isSignificant: false, winner: 'inconclusive' };
  }
  
  const pA = conversionsA / visitorsA;
  const pB = conversionsB / visitorsB;
  const pPool = (conversionsA + conversionsB) / (visitorsA + visitorsB);
  
  if (pPool <= 0 || pPool >= 1) {
    return { zScore: 0, pValue: 1, confidence: 0, isSignificant: false, winner: 'inconclusive' };
  }
  
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / visitorsA + 1 / visitorsB));
  if (se === 0) return { zScore: 0, pValue: 1, confidence: 0, isSignificant: false, winner: 'inconclusive' };
  
  const z = (pB - pA) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const confidence = Math.max(0, Math.min(100, (1 - pValue) * 100));
  const isSignificant = pValue < 0.05;

  return {
    zScore: parseFloat(z.toFixed(3)),
    pValue: parseFloat(pValue.toFixed(4)),
    confidence: parseFloat(confidence.toFixed(1)),
    isSignificant,
    winner: isSignificant ? (pB > pA ? 'variant_b' : 'control') : 'inconclusive'
  };
}

function normalCdf(x) {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2.0);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

function generateIntuitiveVerdict(sig, stats, lift, totalVisitors) {
  const vA = stats.control;
  const vB = stats.variant_b;

  if (totalVisitors < 10) {
    return {
      statusBadge: 'Gathering Early Traffic',
      badgeColor: 'slate',
      headline: 'A/B Test Initializing…',
      description: `Traffic split is active (50/50). Currently observed ${totalVisitors} visitor${totalVisitors === 1 ? '' : 's'}. Automated recommendations will activate as traffic increases.`,
      confidenceLabel: 'Needs More Visitors',
      actionRecommendation: 'Keep 50/50 traffic split running'
    };
  }

  if (sig.isSignificant && sig.winner === 'variant_b') {
    return {
      statusBadge: 'Variant B is Winning',
      badgeColor: 'emerald',
      headline: `Variant B Beats Original by +${lift.cr.toFixed(1)}% Higher Conversion`,
      description: `Variant B (Human-Authentic) is generating €${vB.rpv.toFixed(2)} per visitor vs €${vA.rpv.toFixed(2)} on Control. The statistical model indicates with ${sig.confidence}% certainty that this outcome is genuine.`,
      confidenceLabel: `${sig.confidence}% Certainty (High)`,
      actionRecommendation: 'Recommended: Switch 100% traffic to Variant B'
    };
  }

  if (sig.isSignificant && sig.winner === 'control') {
    return {
      statusBadge: 'Control (Original) is Winning',
      badgeColor: 'amber',
      headline: `Original Template Beats Variant B by +${Math.abs(lift.cr).toFixed(1)}%`,
      description: `The original campaign template is currently converting higher (${vA.cr}% vs ${vB.cr}%).`,
      confidenceLabel: `${sig.confidence}% Certainty (High)`,
      actionRecommendation: 'Recommended: Keep Control or inspect Variant B mobile funnel'
    };
  }

  if (lift.cr > 15 && totalVisitors >= 30) {
    return {
      statusBadge: 'Variant B Trending Ahead',
      badgeColor: 'blue',
      headline: `Variant B Trending +${lift.cr.toFixed(1)}% Higher Conversion`,
      description: `Variant B currently leads with a ${vB.cr}% donation rate (vs ${vA.cr}% on Control) and +${formatDuration(vB.avgStayTime - vA.avgStayTime)} longer reading time. Need ~${Math.max(20, 100 - totalVisitors)} more visitors to reach 95% mathematical certainty.`,
      confidenceLabel: `${sig.confidence}% Confidence (Trending)`,
      actionRecommendation: 'Allow test to collect more conversions'
    };
  }

  if (lift.cr < -15 && totalVisitors >= 30) {
    return {
      statusBadge: 'Control Trending Ahead',
      badgeColor: 'purple',
      headline: `Control (Original) Trending +${Math.abs(lift.cr).toFixed(1)}% Higher`,
      description: `Control currently leads in conversion rate (${vA.cr}% vs ${vB.cr}%). Collecting more data to confirm.`,
      confidenceLabel: `${sig.confidence}% Confidence (Trending)`,
      actionRecommendation: 'Allow test to collect more conversions'
    };
  }

  return {
    statusBadge: 'Too Close to Call',
    badgeColor: 'slate',
    headline: 'Both Variants Performing Similarly',
    description: `Variant A conversion: ${vA.cr}%, Variant B conversion: ${vB.cr}%. Differences remain within normal random distribution.`,
    confidenceLabel: `${sig.confidence}% Confidence (Neutral)`,
    actionRecommendation: 'Keep test running to evaluate larger sample'
  };
}

async function getAbTestMetrics(campaignSlug = null, dateRange = null, rangeKey = 'allTime', tzOffset = 0) {
  const rates = await fetchRates();
  const bounds = calculateDateBounds(dateRange, rangeKey, tzOffset);

  // 1. Filter In-Memory Visitor Sessions
  const filteredVisitors = visitorSessions.filter(s => {
    if (s.timestamp < bounds.startTime || s.timestamp > bounds.endTime) return false;
    if (campaignSlug && campaignSlug !== 'all' && s.campaignSlug !== campaignSlug) return false;
    return true;
  });

  // 2. Query Supabase for Completed Payments in Window
  let paymentsQuery = supabase
    ? supabase
        .from('payments')
        .select('id, amount, service_fee, total_amount, stripe_fee, net_amount, currency, source_ref, user_agent, created_at, ip_address, landing_url')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
    : null;

  let sessionsQuery = supabase
    ? supabase
        .from('checkout_sessions')
        .select('id, amount, currency, source_ref, tracking, ip_address, created_at')
        .order('created_at', { ascending: false })
    : null;

  if (paymentsQuery) {
    if (campaignSlug && campaignSlug !== 'all') {
      paymentsQuery = paymentsQuery.eq('source_ref', campaignSlug);
      if (sessionsQuery) sessionsQuery = sessionsQuery.eq('source_ref', campaignSlug);
    }
    if (bounds.startDateISO && bounds.startTime > 0) {
      paymentsQuery = paymentsQuery.gte('created_at', bounds.startDateISO);
      if (sessionsQuery) sessionsQuery = sessionsQuery.gte('created_at', bounds.startDateISO);
    }
    if (bounds.endDateISO && bounds.endTime < Date.now() + 86400000) {
      paymentsQuery = paymentsQuery.lte('created_at', bounds.endDateISO);
      if (sessionsQuery) sessionsQuery = sessionsQuery.lte('created_at', bounds.endDateISO);
    }
  }

  let payments = [];
  let checkoutSessionsList = [];
  if (paymentsQuery) {
    const [payRes, sessRes] = await Promise.all([
      paymentsQuery,
      sessionsQuery || Promise.resolve({ data: [] })
    ]);
    if (!payRes.error && payRes.data) {
      payments = payRes.data;
    }
    if (!sessRes.error && sessRes.data) {
      checkoutSessionsList = sessRes.data;
    }
  }

  // 3. Initialize Stats for Control and Variant B
  const stats = {
    control: {
      name: VARIANT_NAMES.control,
      visitors: 0,
      mobileVisitors: 0,
      desktopVisitors: 0,
      donations: 0,
      mobileDonations: 0,
      desktopDonations: 0,
      gross: 0,
      net: 0,
      tips: 0,
      checkoutOpens: 0,
      checkoutInitiations: 0,
      stayTimeSum: 0,
      stayTimeCount: 0,
      scroll25: 0,
      scroll50: 0,
      scroll75: 0,
      scroll100: 0,
      bounces: 0,
      currency: 'EUR'
    },
    variant_b: {
      name: VARIANT_NAMES.variant_b,
      visitors: 0,
      mobileVisitors: 0,
      desktopVisitors: 0,
      donations: 0,
      mobileDonations: 0,
      desktopDonations: 0,
      gross: 0,
      net: 0,
      tips: 0,
      checkoutOpens: 0,
      checkoutInitiations: 0,
      stayTimeSum: 0,
      stayTimeCount: 0,
      scroll25: 0,
      scroll50: 0,
      scroll75: 0,
      scroll100: 0,
      bounces: 0,
      currency: 'EUR'
    }
  };

  // Build visitor lists for deep inspection
  const visitorLists = {
    control: [],
    variant_b: []
  };

  // Aggregate Filtered Visitor Sessions
  for (const s of filteredVisitors) {
    const target = s.variant === VARIANTS.VARIANT_B ? stats.variant_b : stats.control;
    const list = s.variant === VARIANTS.VARIANT_B ? visitorLists.variant_b : visitorLists.control;

    target.visitors++;
    if (s.isMobile) target.mobileVisitors++;
    else target.desktopVisitors++;

    if (s.checkoutOpened) target.checkoutOpens++;
    if (s.checkoutInitiated) target.checkoutInitiations++;

    if (s.stayTime > 0) {
      target.stayTimeSum += s.stayTime;
      target.stayTimeCount++;
      if (s.stayTime < 6 && !s.checkoutOpened) target.bounces++;
    }

    if (s.scrollDepth >= 100) target.scroll100++;
    else if (s.scrollDepth >= 75) target.scroll75++;
    else if (s.scrollDepth >= 50) target.scroll50++;
    else if (s.scrollDepth >= 25) target.scroll25++;

    // Add to detail list (up to 50 most recent per variant)
    if (list.length < 50) {
      list.push({
        id: s.id,
        timeAgo: formatRelativeTime(s.timestamp),
        timeFormatted: new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        dateFormatted: new Date(s.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        ip: s.ip || 'Unknown',
        locationLabel: s.locationLabel || (s.country ? `${s.city ? s.city + ', ' : ''}${s.country}` : 'Unknown Location'),
        countryCode: s.countryCode || '',
        isMobile: s.isMobile,
        deviceType: s.deviceType,
        deviceLabel: s.deviceLabel,
        stayTimeSeconds: s.stayTime,
        stayTimeFormatted: formatDuration(s.stayTime),
        scrollDepth: s.scrollDepth,
        checkoutOpened: s.checkoutOpened,
        checkoutInitiated: s.checkoutInitiated || false,
        donated: s.donated,
        amountFormatted: s.amount > 0 ? `£${s.amount.toFixed(2)}` : '—',
        campaign: s.campaignSlug
      });
    }
  }

  // Aggregate Payments
  for (const p of payments) {
    const cur = p.currency || 'EUR';
    const rawAmt = parseFloat(p.amount) || 0;
    const rawNet = parseFloat(p.net_amount || p.total_amount || 0);
    const rawTip = parseFloat(p.service_fee || 0);

    const grossBase = convertToBase(rawAmt, cur, rates);
    const netBase = convertToBase(rawNet, cur, rates);
    const tipBase = convertToBase(rawTip, cur, rates);

    let trackingVariant = 'control';
    if (p.landing_url && (p.landing_url.includes('variant=variant_b') || p.landing_url.includes('variant=b'))) {
      trackingVariant = VARIANTS.VARIANT_B;
    } else {
      const s = checkoutSessionsList.find(cs => cs.ip_address === p.ip_address && Math.abs(parseFloat(cs.amount) - rawAmt) < 0.01);
      if (s && s.tracking?.variant === VARIANTS.VARIANT_B) {
        trackingVariant = VARIANTS.VARIANT_B;
      }
    }
    const targetKey = trackingVariant === VARIANTS.VARIANT_B ? VARIANTS.VARIANT_B : VARIANTS.CONTROL;
    const isMobile = /mobile|iphone|android|ipad|tablet|ipod/i.test(p.user_agent || '');

    stats[targetKey].donations++;
    stats[targetKey].gross += grossBase;
    stats[targetKey].net += netBase;
    stats[targetKey].tips += tipBase;
    if (isMobile) {
      stats[targetKey].mobileDonations++;
    } else {
      stats[targetKey].desktopDonations++;
    }
  }

  const totalRawVisitors = stats.control.visitors + stats.variant_b.visitors;

  for (const key of ['control', 'variant_b']) {
    const v = stats[key];
    const visitorDenom = Math.max(v.visitors, v.donations > 0 ? v.donations : 0);
    
    v.cr = visitorDenom > 0 ? parseFloat(((v.donations / visitorDenom) * 100).toFixed(2)) : 0;
    v.mobileCr = v.mobileVisitors > 0 ? parseFloat(((v.mobileDonations / v.mobileVisitors) * 100).toFixed(2)) : 0;
    v.desktopCr = v.desktopVisitors > 0 ? parseFloat(((v.desktopDonations / v.desktopVisitors) * 100).toFixed(2)) : 0;
    v.aov = v.donations > 0 ? parseFloat((v.gross / v.donations).toFixed(2)) : 0;
    v.rpv = visitorDenom > 0 ? parseFloat((v.net / visitorDenom).toFixed(2)) : 0;
    
    // Engagement KPIs
    v.avgStayTime = v.stayTimeCount > 0 ? Math.round(v.stayTimeSum / v.stayTimeCount) : 0;
    v.avgStayTimeFormatted = formatDuration(v.avgStayTime);
    v.checkoutOpenRate = visitorDenom > 0 ? parseFloat(((v.checkoutOpens / visitorDenom) * 100).toFixed(1)) : 0;
    v.checkoutInitRate = visitorDenom > 0 ? parseFloat(((v.checkoutInitiations / visitorDenom) * 100).toFixed(1)) : 0;
    v.bounceRate = visitorDenom > 0 ? parseFloat(((v.bounces / visitorDenom) * 100).toFixed(1)) : 0;
    v.deepScrollRate = visitorDenom > 0 ? parseFloat(((v.scroll75 / visitorDenom) * 100).toFixed(1)) : 0;

    v.gross = parseFloat(v.gross.toFixed(2));
    v.net = parseFloat(v.net.toFixed(2));
    v.tips = parseFloat(v.tips.toFixed(2));
  }

  const significance = calculateZScore(
    stats.control.donations,
    Math.max(stats.control.visitors, 1),
    stats.variant_b.donations,
    Math.max(stats.variant_b.visitors, 1)
  );

  const crDiff = stats.control.cr > 0 
    ? parseFloat((((stats.variant_b.cr - stats.control.cr) / stats.control.cr) * 100).toFixed(1))
    : (stats.variant_b.cr > 0 ? 100 : 0);

  const rpvDiff = stats.control.rpv > 0
    ? parseFloat((((stats.variant_b.rpv - stats.control.rpv) / stats.control.rpv) * 100).toFixed(1))
    : (stats.variant_b.rpv > 0 ? 100 : 0);

  const stayTimeDiff = stats.control.avgStayTime > 0
    ? parseFloat((((stats.variant_b.avgStayTime - stats.control.avgStayTime) / stats.control.avgStayTime) * 100).toFixed(1))
    : 0;

  const intuitiveVerdict = generateIntuitiveVerdict(significance, stats, { cr: crDiff, rpv: rpvDiff, stayTime: stayTimeDiff }, totalRawVisitors);

  return {
    variants: stats,
    visitorLists,
    significance,
    verdict: intuitiveVerdict,
    lift: {
      cr: crDiff,
      rpv: rpvDiff,
      stayTime: stayTimeDiff
    },
    totalVisitors: stats.control.visitors + stats.variant_b.visitors,
    totalDonations: stats.control.donations + stats.variant_b.donations,
    totalRevenue: parseFloat((stats.control.gross + stats.variant_b.gross).toFixed(2)),
    bounds: {
      rangeKey,
      startDate: bounds.startDateISO,
      endDate: bounds.endDateISO
    },
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  VARIANTS,
  VARIANT_NAMES,
  COOKIE_NAME,
  SID_COOKIE_NAME,
  resolveVariant,
  setVariantCookie,
  recordImpression,
  recordEngagementEvent,
  getAbTestMetrics,
  resetAbTestData
};
