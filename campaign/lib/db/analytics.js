const { supabase, fetchRates, convertToBase, BASE_CURRENCY } = require('./client');
const { parseUserAgent } = require('../userAgentParser');

async function getAdminDashboardStats(campaignSlug = null, dateRange = null) {
  if (!supabase) return null;

  try {
    let query = supabase
      .from('payments')
      .select('amount, service_fee, total_amount, stripe_fee, net_amount, customer_id, created_at, source_ref, currency')
      .eq('status', 'completed');

    if (campaignSlug && campaignSlug !== 'all') {
      query = query.eq('source_ref', campaignSlug);
    }
    if (dateRange?.startDate) query = query.gte('created_at', dateRange.startDate);
    if (dateRange?.endDate) query = query.lte('created_at', dateRange.endDate);

    const { data: payments, error } = await query;
    if (error) return null;

    const rates = await fetchRates();
    let totalRaised = 0, totalTips = 0, totalGross = 0, totalFees = 0, totalNet = 0;
    const currencyBreakdown = {};
    const campaignBreakdown = {};

    payments.forEach(p => {
      const cur = p.currency || 'EUR';
      const amt = parseFloat(p.amount);
      const tip = parseFloat(p.service_fee || 0);
      const gross = parseFloat(p.total_amount || 0);
      const fee = parseFloat(p.stripe_fee || 0);
      const net = parseFloat(p.net_amount || p.total_amount || 0);

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

      const campaign = p.source_ref;
      if (!campaignBreakdown[campaign]) {
        campaignBreakdown[campaign] = { raised: 0, count: 0, tips: 0, fees: 0, gross: 0, net: 0 };
      }
      campaignBreakdown[campaign].raised += amtBase;
      campaignBreakdown[campaign].count++;
      campaignBreakdown[campaign].tips += tipBase;
      campaignBreakdown[campaign].fees += feeBase;
      campaignBreakdown[campaign].gross += grossBase;
      campaignBreakdown[campaign].net += netBase;
    });

    const uniqueCustomers = new Set(payments.map(p => p.customer_id).filter(Boolean)).size;

    return {
      raised: totalRaised,
      tips: totalTips,
      gross: totalGross,
      fees: totalFees,
      net: totalNet,
      donorCount: uniqueCustomers || payments.length,
      transactionCount: payments.length,
      avgDonation: payments.length > 0 ? totalRaised / payments.length : 0,
      campaignBreakdown,
      currencyBreakdown,
      baseCurrency: BASE_CURRENCY
    };
  } catch (err) {
    console.error('Dashboard stats exception:', err);
    return null;
  }
}

async function getTimeBasedAnalytics(campaignSlug = null, dateRange = null) {
  if (!supabase) return null;

  try {
    let query = supabase
      .from('payments')
      .select('created_at, amount, source_ref, currency')
      .eq('status', 'completed');

    if (campaignSlug && campaignSlug !== 'all') query = query.eq('source_ref', campaignSlug);
    if (dateRange?.startDate) query = query.gte('created_at', dateRange.startDate);
    if (dateRange?.endDate) query = query.lte('created_at', dateRange.endDate);

    const { data: payments, error } = await query;
    if (error) return null;

    const rates = await fetchRates();

    const byHour = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0, amount: 0, avgAmount: 0 }));
    const byDayOfWeek = Array.from({ length: 7 }, (_, i) => ({
      day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i],
      dayNum: i, count: 0, amount: 0, avgAmount: 0
    }));
    const byDayOfMonth = Array.from({ length: 31 }, (_, i) => ({ day: i + 1, count: 0, amount: 0, avgAmount: 0 }));
    const byMonth = Array.from({ length: 12 }, (_, i) => ({
      month: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][i],
      monthNum: i + 1, count: 0, amount: 0, avgAmount: 0
    }));

    payments.forEach(p => {
      const date = new Date(p.created_at);
      const amount = convertToBase(parseFloat(p.amount), p.currency || 'EUR', rates);

      byHour[date.getHours()].count++;
      byHour[date.getHours()].amount += amount;
      byDayOfWeek[date.getDay()].count++;
      byDayOfWeek[date.getDay()].amount += amount;
      byDayOfMonth[date.getDate() - 1].count++;
      byDayOfMonth[date.getDate() - 1].amount += amount;
      byMonth[date.getMonth()].count++;
      byMonth[date.getMonth()].amount += amount;
    });

    byHour.forEach(h => { h.avgAmount = h.count > 0 ? h.amount / h.count : 0; });
    byDayOfWeek.forEach(d => { d.avgAmount = d.count > 0 ? d.amount / d.count : 0; });
    byDayOfMonth.forEach(d => { d.avgAmount = d.count > 0 ? d.amount / d.count : 0; });
    byMonth.forEach(m => { m.avgAmount = m.count > 0 ? m.amount / m.count : 0; });

    return {
      byHour, byDayOfWeek, byDayOfMonth, byMonth,
      peakHours: [...byHour].sort((a, b) => b.count - a.count).slice(0, 3),
      peakDays: [...byDayOfWeek].sort((a, b) => b.count - a.count).slice(0, 3)
    };
  } catch (err) {
    console.error('Time analytics exception:', err);
    return null;
  }
}

async function getDeviceBrowserAnalytics(campaignSlug = null, dateRange = null) {
  if (!supabase) return null;

  try {
    let query = supabase
      .from('payments')
      .select('user_agent, payment_source, amount, source_ref, currency')
      .eq('status', 'completed');

    if (campaignSlug && campaignSlug !== 'all') query = query.eq('source_ref', campaignSlug);
    if (dateRange?.startDate) query = query.gte('created_at', dateRange.startDate);
    if (dateRange?.endDate) query = query.lte('created_at', dateRange.endDate);

    const { data: payments, error } = await query;
    if (error) return null;

    const rates = await fetchRates();

    const deviceStats = {
      mobile: { count: 0, totalAmount: 0, avgAmount: 0, percentage: 0 },
      desktop: { count: 0, totalAmount: 0, avgAmount: 0, percentage: 0 },
      tablet: { count: 0, totalAmount: 0, avgAmount: 0, percentage: 0 },
      unknown: { count: 0, totalAmount: 0, avgAmount: 0, percentage: 0 }
    };
    const browserStats = {
      chrome: { count: 0, amount: 0, avgAmount: 0 },
      safari: { count: 0, amount: 0, avgAmount: 0 },
      firefox: { count: 0, amount: 0, avgAmount: 0 },
      edge: { count: 0, amount: 0, avgAmount: 0 },
      other: { count: 0, amount: 0, avgAmount: 0 }
    };
    const paymentByDevice = { mobile: {}, desktop: {}, tablet: {} };

    payments.forEach(p => {
      const amount = convertToBase(parseFloat(p.amount), p.currency || 'EUR', rates);
      const parsed = parseUserAgent(p.user_agent);

      if (deviceStats[parsed.deviceType]) {
        deviceStats[parsed.deviceType].count++;
        deviceStats[parsed.deviceType].totalAmount += amount;
      }

      if (browserStats[parsed.browser]) {
        browserStats[parsed.browser].count++;
        browserStats[parsed.browser].amount += amount;
      } else {
        browserStats.other.count++;
        browserStats.other.amount += amount;
      }

      const ps = p.payment_source || 'unknown';
      if (paymentByDevice[parsed.deviceType]) {
        paymentByDevice[parsed.deviceType][ps] = (paymentByDevice[parsed.deviceType][ps] || 0) + 1;
      }
    });

    const totalCount = payments.length;
    Object.values(deviceStats).forEach(s => {
      s.avgAmount = s.count > 0 ? s.totalAmount / s.count : 0;
      s.percentage = totalCount > 0 ? (s.count / totalCount) * 100 : 0;
    });
    Object.values(browserStats).forEach(s => {
      s.avgAmount = s.count > 0 ? s.amount / s.count : 0;
    });

    return {
      byDeviceType: deviceStats,
      byBrowser: browserStats,
      paymentMethodByDevice: paymentByDevice,
      deviceComparison: {
        mobileCount: deviceStats.mobile.count,
        desktopCount: deviceStats.desktop.count,
        mobileAvgAmount: deviceStats.mobile.avgAmount,
        desktopAvgAmount: deviceStats.desktop.avgAmount,
        mobilePercentage: deviceStats.mobile.percentage,
        desktopPercentage: deviceStats.desktop.percentage
      }
    };
  } catch (err) {
    console.error('Device analytics exception:', err);
    return null;
  }
}

module.exports = { getAdminDashboardStats, getTimeBasedAnalytics, getDeviceBrowserAnalytics };
