const { supabase, fetchRates, convertToBase } = require('./db/client');

const VARIANTS = {
  CONTROL: 'control',
  VARIANT_B: 'variant_b'
};

const VARIANT_NAMES = {
  control: 'Original Template (Control)',
  variant_b: 'Human-Authentic (Variant B)'
};

const COOKIE_NAME = '_ab_variant';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const inMemoryImpressions = {
  control: { total: 0, mobile: 0, desktop: 0, firstSeen: Date.now() },
  variant_b: { total: 0, mobile: 0, desktop: 0, firstSeen: Date.now() }
};

const visitorVariantMap = new Map();

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

function recordImpression(variant, userAgent = '', ip = '') {
  if (!inMemoryImpressions[variant]) return;
  
  const visitorKey = `${ip}_${variant}`;
  const isMobile = /mobile|iphone|android|ipad|tablet/i.test(userAgent || '');

  if (!visitorVariantMap.has(visitorKey)) {
    visitorVariantMap.set(visitorKey, { variant, time: Date.now(), isMobile });
    inMemoryImpressions[variant].total++;
    if (isMobile) {
      inMemoryImpressions[variant].mobile++;
    } else {
      inMemoryImpressions[variant].desktop++;
    }

    if (visitorVariantMap.size > 20000) {
      const oldestKey = visitorVariantMap.keys().next().value;
      visitorVariantMap.delete(oldestKey);
    }
  }
}

function calculateZScore(conversionsA, visitorsA, conversionsB, visitorsB) {
  if (visitorsA === 0 || visitorsB === 0) return { zScore: 0, pValue: 1, confidence: 0, isSignificant: false };
  
  const pA = conversionsA / visitorsA;
  const pB = conversionsB / visitorsB;
  const pPool = (conversionsA + conversionsB) / (visitorsA + visitorsB);
  
  if (pPool === 0 || pPool === 1) return { zScore: 0, pValue: 1, confidence: 0, isSignificant: false };
  
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / visitorsA + 1 / visitorsB));
  if (se === 0) return { zScore: 0, pValue: 1, confidence: 0, isSignificant: false };
  
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

async function getAbTestMetrics(campaignSlug = null, dateRange = null) {
  const rates = await fetchRates();

  let paymentsQuery = supabase
    ? supabase
        .from('payments')
        .select('id, amount, service_fee, total_amount, stripe_fee, net_amount, currency, source_ref, user_agent, created_at, checkout_sessions(tracking)')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
    : null;

  if (paymentsQuery) {
    if (campaignSlug && campaignSlug !== 'all') {
      paymentsQuery = paymentsQuery.eq('source_ref', campaignSlug);
    }
    if (dateRange?.startDate) {
      paymentsQuery = paymentsQuery.gte('created_at', dateRange.startDate);
    }
    if (dateRange?.endDate) {
      paymentsQuery = paymentsQuery.lte('created_at', dateRange.endDate);
    }
  }

  let payments = [];
  if (paymentsQuery) {
    const { data, error } = await paymentsQuery;
    if (!error && data) {
      payments = data;
    }
  }

  const stats = {
    control: {
      name: VARIANT_NAMES.control,
      visitors: Math.max(inMemoryImpressions.control.total, 1),
      mobileVisitors: inMemoryImpressions.control.mobile,
      desktopVisitors: inMemoryImpressions.control.desktop,
      donations: 0,
      mobileDonations: 0,
      desktopDonations: 0,
      gross: 0,
      net: 0,
      tips: 0,
      currency: 'EUR'
    },
    variant_b: {
      name: VARIANT_NAMES.variant_b,
      visitors: Math.max(inMemoryImpressions.variant_b.total, 1),
      mobileVisitors: inMemoryImpressions.variant_b.mobile,
      desktopVisitors: inMemoryImpressions.variant_b.desktop,
      donations: 0,
      mobileDonations: 0,
      desktopDonations: 0,
      gross: 0,
      net: 0,
      tips: 0,
      currency: 'EUR'
    }
  };

  for (const p of payments) {
    const cur = p.currency || 'EUR';
    const rawAmt = parseFloat(p.amount) || 0;
    const rawNet = parseFloat(p.net_amount || p.total_amount || 0);
    const rawTip = parseFloat(p.service_fee || 0);

    const grossBase = convertToBase(rawAmt, cur, rates);
    const netBase = convertToBase(rawNet, cur, rates);
    const tipBase = convertToBase(rawTip, cur, rates);

    const trackingVariant = p.checkout_sessions?.tracking?.variant;
    const targetKey = trackingVariant === VARIANTS.VARIANT_B ? VARIANTS.VARIANT_B : VARIANTS.CONTROL;
    const isMobile = /mobile|iphone|android|ipad|tablet/i.test(p.user_agent || '');

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

  for (const key of ['control', 'variant_b']) {
    const v = stats[key];
    v.cr = v.visitors > 0 ? parseFloat(((v.donations / v.visitors) * 100).toFixed(2)) : 0;
    v.mobileCr = v.mobileVisitors > 0 ? parseFloat(((v.mobileDonations / v.mobileVisitors) * 100).toFixed(2)) : 0;
    v.desktopCr = v.desktopVisitors > 0 ? parseFloat(((v.desktopDonations / v.desktopVisitors) * 100).toFixed(2)) : 0;
    v.aov = v.donations > 0 ? parseFloat((v.gross / v.donations).toFixed(2)) : 0;
    v.rpv = v.visitors > 0 ? parseFloat((v.net / v.visitors).toFixed(2)) : 0;
    v.gross = parseFloat(v.gross.toFixed(2));
    v.net = parseFloat(v.net.toFixed(2));
    v.tips = parseFloat(v.tips.toFixed(2));
  }

  const significance = calculateZScore(
    stats.control.donations,
    stats.control.visitors,
    stats.variant_b.donations,
    stats.variant_b.visitors
  );

  const crDiff = stats.control.cr > 0 
    ? parseFloat((((stats.variant_b.cr - stats.control.cr) / stats.control.cr) * 100).toFixed(1))
    : 0;

  const rpvDiff = stats.control.rpv > 0
    ? parseFloat((((stats.variant_b.rpv - stats.control.rpv) / stats.control.rpv) * 100).toFixed(1))
    : 0;

  return {
    variants: stats,
    significance,
    lift: {
      cr: crDiff,
      rpv: rpvDiff
    },
    totalVisitors: stats.control.visitors + stats.variant_b.visitors,
    totalDonations: stats.control.donations + stats.variant_b.donations,
    totalRevenue: parseFloat((stats.control.gross + stats.variant_b.gross).toFixed(2)),
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  VARIANTS,
  VARIANT_NAMES,
  COOKIE_NAME,
  resolveVariant,
  setVariantCookie,
  recordImpression,
  getAbTestMetrics
};
