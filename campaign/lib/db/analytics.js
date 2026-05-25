const { supabase, fetchRates, convertToBase, BASE_CURRENCY } = require('./client');
const { parseUserAgent } = require('../userAgentParser');

const DASHBOARD_FIELDS =
  'amount, service_fee, total_amount, stripe_fee, net_amount, customer_id, ' +
  'created_at, source_ref, currency, store_id, store_domain, payment_method, ' +
  'payment_source, user_agent';

const DASHBOARD_HARD_LIMIT = 5000;

function toExclusiveEnd(endDate) {
  const s = String(endDate);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!dateOnly) return s;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return s;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

function applyFilters(query, campaignSlug, dateRange) {
  if (campaignSlug && campaignSlug !== 'all') query = query.eq('source_ref', campaignSlug);
  if (dateRange?.startDate) query = query.gte('created_at', dateRange.startDate);
  if (dateRange?.endDate) {
    const end = toExclusiveEnd(dateRange.endDate);
    query = end === String(dateRange.endDate)
      ? query.lte('created_at', dateRange.endDate)
      : query.lt('created_at', end);
  }
  return query;
}

async function fetchCompletedPayments(campaignSlug, dateRange, fields, limit = DASHBOARD_HARD_LIMIT) {
  if (!supabase) return { data: null, error: new Error('supabase_not_configured') };
  let query = supabase
    .from('payments')
    .select(fields)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(limit);
  query = applyFilters(query, campaignSlug, dateRange);
  return query;
}

function emptyDeviceStats() {
  const tpl = () => ({ count: 0, totalAmount: 0, avgAmount: 0, percentage: 0 });
  return { mobile: tpl(), desktop: tpl(), tablet: tpl(), unknown: tpl() };
}

function emptyBrowserStats() {
  const tpl = () => ({ count: 0, amount: 0, avgAmount: 0 });
  return { chrome: tpl(), safari: tpl(), firefox: tpl(), edge: tpl(), other: tpl() };
}

function emptyTimeBuckets() {
  const byHour = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0, amount: 0, avgAmount: 0 }));
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const byDayOfWeek = days.map((day, i) => ({ day, dayNum: i, count: 0, amount: 0, avgAmount: 0 }));
  const byDayOfMonth = Array.from({ length: 31 }, (_, i) => ({ day: i + 1, count: 0, amount: 0, avgAmount: 0 }));
  const byMonth = months.map((month, i) => ({ month, monthNum: i + 1, count: 0, amount: 0, avgAmount: 0 }));
  return { byHour, byDayOfWeek, byDayOfMonth, byMonth };
}

function aggregateAll(payments, rates) {
  let totalRaised = 0, totalTips = 0, totalGross = 0, totalFees = 0, totalNet = 0;
  const currencyBreakdown = {};
  const campaignBreakdown = {};
  const storeBreakdown = {};
  const deviceStats = emptyDeviceStats();
  const browserStats = emptyBrowserStats();
  const paymentByDevice = { mobile: {}, desktop: {}, tablet: {} };
  const time = emptyTimeBuckets();

  for (const p of payments) {
    const cur = p.currency || 'EUR';
    const amt = parseFloat(p.amount) || 0;
    const tip = parseFloat(p.service_fee || 0) || 0;
    const gross = parseFloat(p.total_amount || 0) || 0;
    const fee = parseFloat(p.stripe_fee || 0) || 0;
    const net = parseFloat(p.net_amount || p.total_amount || 0) || 0;

    const amtBase = convertToBase(amt, cur, rates);
    const tipBase = convertToBase(tip, cur, rates);
    const grossBase = convertToBase(gross, cur, rates);
    const feeBase = convertToBase(fee, cur, rates);
    const netBase = convertToBase(net, cur, rates);

    totalRaised += amtBase;
    totalTips += tipBase;
    totalGross += grossBase;
    totalFees += feeBase;
    totalNet += netBase;

    if (!currencyBreakdown[cur]) {
      currencyBreakdown[cur] = { raised: 0, tips: 0, fees: 0, net: 0, count: 0, raisedBase: 0 };
    }
    currencyBreakdown[cur].raised += amt;
    currencyBreakdown[cur].tips += tip;
    currencyBreakdown[cur].fees += fee;
    currencyBreakdown[cur].net += net;
    currencyBreakdown[cur].count++;
    currencyBreakdown[cur].raisedBase += amtBase;

    const campaignKey = p.source_ref || 'unknown';
    if (!campaignBreakdown[campaignKey]) {
      campaignBreakdown[campaignKey] = { raised: 0, count: 0, tips: 0, fees: 0, gross: 0, net: 0 };
    }
    campaignBreakdown[campaignKey].raised += amtBase;
    campaignBreakdown[campaignKey].count++;
    campaignBreakdown[campaignKey].tips += tipBase;
    campaignBreakdown[campaignKey].fees += feeBase;
    campaignBreakdown[campaignKey].gross += grossBase;
    campaignBreakdown[campaignKey].net += netBase;

    const storeKey = p.store_id || 'unknown';
    if (!storeBreakdown[storeKey]) {
      storeBreakdown[storeKey] = {
        domain: p.store_domain || 'unknown',
        processor: p.payment_method || 'stripe',
        raised: 0, count: 0, tips: 0, fees: 0, gross: 0, net: 0
      };
    }
    storeBreakdown[storeKey].raised += amtBase;
    storeBreakdown[storeKey].count++;
    storeBreakdown[storeKey].tips += tipBase;
    storeBreakdown[storeKey].fees += feeBase;
    storeBreakdown[storeKey].gross += grossBase;
    storeBreakdown[storeKey].net += netBase;

    const parsed = parseUserAgent(p.user_agent);
    if (deviceStats[parsed.deviceType]) {
      deviceStats[parsed.deviceType].count++;
      deviceStats[parsed.deviceType].totalAmount += amtBase;
    }
    if (browserStats[parsed.browser]) {
      browserStats[parsed.browser].count++;
      browserStats[parsed.browser].amount += amtBase;
    } else {
      browserStats.other.count++;
      browserStats.other.amount += amtBase;
    }
    const ps = p.payment_source || 'unknown';
    if (paymentByDevice[parsed.deviceType]) {
      paymentByDevice[parsed.deviceType][ps] = (paymentByDevice[parsed.deviceType][ps] || 0) + 1;
    }

    const date = new Date(p.created_at);
    if (!Number.isNaN(date.getTime())) {
      time.byHour[date.getHours()].count++;
      time.byHour[date.getHours()].amount += amtBase;
      time.byDayOfWeek[date.getDay()].count++;
      time.byDayOfWeek[date.getDay()].amount += amtBase;
      time.byDayOfMonth[date.getDate() - 1].count++;
      time.byDayOfMonth[date.getDate() - 1].amount += amtBase;
      time.byMonth[date.getMonth()].count++;
      time.byMonth[date.getMonth()].amount += amtBase;
    }
  }

  const totalCount = payments.length;
  Object.values(deviceStats).forEach(s => {
    s.avgAmount = s.count > 0 ? s.totalAmount / s.count : 0;
    s.percentage = totalCount > 0 ? (s.count / totalCount) * 100 : 0;
  });
  Object.values(browserStats).forEach(s => {
    s.avgAmount = s.count > 0 ? s.amount / s.count : 0;
  });
  time.byHour.forEach(h => { h.avgAmount = h.count > 0 ? h.amount / h.count : 0; });
  time.byDayOfWeek.forEach(d => { d.avgAmount = d.count > 0 ? d.amount / d.count : 0; });
  time.byDayOfMonth.forEach(d => { d.avgAmount = d.count > 0 ? d.amount / d.count : 0; });
  time.byMonth.forEach(m => { m.avgAmount = m.count > 0 ? m.amount / m.count : 0; });

  const uniqueCustomers = new Set(payments.map(p => p.customer_id).filter(Boolean)).size;

  return {
    totalRaised, totalTips, totalGross, totalFees, totalNet,
    currencyBreakdown, campaignBreakdown, storeBreakdown,
    deviceStats, browserStats, paymentByDevice, time,
    uniqueCustomers, transactionCount: payments.length
  };
}

async function getDashboardOverview(campaignSlug = null, dateRange = null) {
  const { data: payments, error } = await fetchCompletedPayments(campaignSlug, dateRange, DASHBOARD_FIELDS);
  if (error || !payments) {
    console.error('[analytics] dashboard fetch failed:', error?.message || error);
    return null;
  }

  const rates = await fetchRates();
  const agg = aggregateAll(payments, rates);

  return {
    raised: agg.totalRaised,
    tips: agg.totalTips,
    gross: agg.totalGross,
    fees: agg.totalFees,
    net: agg.totalNet,
    donorCount: agg.uniqueCustomers || agg.transactionCount,
    transactionCount: agg.transactionCount,
    avgDonation: agg.transactionCount > 0 ? agg.totalRaised / agg.transactionCount : 0,
    campaignBreakdown: agg.campaignBreakdown,
    storeBreakdown: agg.storeBreakdown,
    currencyBreakdown: agg.currencyBreakdown,
    timeAnalytics: {
      byHour: agg.time.byHour,
      byDayOfWeek: agg.time.byDayOfWeek,
      byDayOfMonth: agg.time.byDayOfMonth,
      byMonth: agg.time.byMonth,
      peakHours: [...agg.time.byHour].sort((a, b) => b.count - a.count).slice(0, 3),
      peakDays: [...agg.time.byDayOfWeek].sort((a, b) => b.count - a.count).slice(0, 3)
    },
    deviceAnalytics: {
      byDeviceType: agg.deviceStats,
      byBrowser: agg.browserStats,
      paymentMethodByDevice: agg.paymentByDevice,
      deviceComparison: {
        mobileCount: agg.deviceStats.mobile.count,
        desktopCount: agg.deviceStats.desktop.count,
        mobileAvgAmount: agg.deviceStats.mobile.avgAmount,
        desktopAvgAmount: agg.deviceStats.desktop.avgAmount,
        mobilePercentage: agg.deviceStats.mobile.percentage,
        desktopPercentage: agg.deviceStats.desktop.percentage
      }
    },
    baseCurrency: BASE_CURRENCY
  };
}

async function getAdminDashboardStats(campaignSlug = null, dateRange = null) {
  const overview = await getDashboardOverview(campaignSlug, dateRange);
  if (!overview) return null;
  const { timeAnalytics, deviceAnalytics, ...stats } = overview;
  return stats;
}

async function getTimeBasedAnalytics(campaignSlug = null, dateRange = null) {
  const overview = await getDashboardOverview(campaignSlug, dateRange);
  if (!overview) return null;
  return overview.timeAnalytics;
}

async function getDeviceBrowserAnalytics(campaignSlug = null, dateRange = null) {
  const overview = await getDashboardOverview(campaignSlug, dateRange);
  if (!overview) return null;
  return overview.deviceAnalytics;
}

module.exports = {
  getAdminDashboardStats,
  getTimeBasedAnalytics,
  getDeviceBrowserAnalytics,
  getDashboardOverview
};
