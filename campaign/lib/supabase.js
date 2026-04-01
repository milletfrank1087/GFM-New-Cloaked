const { createClient } = require('@supabase/supabase-js');
const { fetchRates, convertToBase, BASE_CURRENCY } = require('./exchangeRate');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase credentials not configured. Database features disabled.');
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

const gradientColors = [
  'from-blue-400 to-blue-500',
  'from-violet-400 to-violet-500',
  'from-rose-400 to-rose-500',
  'from-amber-400 to-amber-500',
  'from-emerald-400 to-emerald-500',
  'from-cyan-400 to-cyan-500',
  'from-pink-400 to-pink-500',
  'from-indigo-400 to-indigo-500',
];

function getRandomGradient() {
  return gradientColors[Math.floor(Math.random() * gradientColors.length)];
}

function getInitials(name) {
  if (!name || name === 'Anonymous') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${diffDays} days ago`;
}

async function createDonationToken(tokenData) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('checkout_sessions')
      .insert({
        token: tokenData.token,
        amount: tokenData.amount,
        currency: tokenData.currency,
        source_ref: tokenData.campaignSlug,
        store_id: tokenData.storeId,
        language: tokenData.language,
        service_fee: tokenData.tipAmount || 0,
        guest_checkout: tokenData.isAnonymous || false,
        customer_email: tokenData.donorEmail || null,
        tracking: tokenData.tracking || {},
        ip_address: tokenData.ipAddress || null,
        user_agent: tokenData.userAgent || null,
        expires_at: tokenData.expiresAt
      })
      .select()
      .single();

    if (error) {
      console.error('Token creation error:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Token creation exception:', err);
    return null;
  }
}

async function getNextStore() {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.rpc('get_next_store');

    if (error) {
      console.error('Get next store error:', error);
      return null;
    }

    return data?.[0] || null;
  } catch (err) {
    console.error('Get next store exception:', err);
    return null;
  }
}

async function getStoreStats() {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('stores')
      .select('id, slug, domain, name, status, total_processed, transaction_count, max_monthly_volume, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Store stats error:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Store stats exception:', err);
    return [];
  }
}

async function toggleStoreStatus(storeId, status) {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    const { error } = await supabase
      .from('stores')
      .update({ status })
      .eq('id', storeId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getRecentRealDonations(campaignSlug, limit = 20) {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('payments')
      .select('id, customer_name, amount, currency, stripe_charge_id, created_at')
      .eq('source_ref', campaignSlug)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];

    return data.map(d => ({
      name: d.customer_name,
      amount: parseFloat(d.amount),
      time: formatTimeAgo(d.created_at),
      initials: getInitials(d.customer_name),
      color: getRandomGradient(),
      message: '',
      transactionId: d.stripe_charge_id,
      timestamp: new Date(d.created_at).getTime(),
      isReal: true
    }));
  } catch (err) {
    console.error('Get donations exception:', err);
    return [];
  }
}

async function getCampaignRealStats(campaignSlug) {
  if (!supabase) return { realRaised: 0, realDonorCount: 0 };

  try {
    const { data, error } = await supabase
      .from('payments')
      .select('amount, customer_id, currency')
      .eq('source_ref', campaignSlug)
      .eq('status', 'completed');

    if (error) return { realRaised: 0, realDonorCount: 0 };

    const rates = await fetchRates();
    const realRaised = data.reduce((sum, p) => {
      return sum + convertToBase(parseFloat(p.amount), p.currency || 'EUR', rates);
    }, 0);
    const uniqueCustomers = new Set(data.map(p => p.customer_id).filter(Boolean)).size;

    return {
      realRaised,
      realDonorCount: uniqueCustomers || data.length
    };
  } catch (err) {
    console.error('Get stats exception:', err);
    return { realRaised: 0, realDonorCount: 0 };
  }
}

async function getAllCustomers() {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return [];

    const customerIds = data.map(c => c.id);
    const { data: latestPayments } = await supabase
      .from('payments')
      .select('customer_id, payment_source, card_brand, card_last_digits, store_domain')
      .in('customer_id', customerIds)
      .order('created_at', { ascending: false });

    const paymentMap = {};
    for (const p of (latestPayments || [])) {
      if (!paymentMap[p.customer_id]) {
        paymentMap[p.customer_id] = p;
      }
    }

    return data.map(c => {
      const latestPayment = paymentMap[c.id] || {};
      return {
        id: c.id,
        name: c.name,
        initials: c.initials || '?',
        email: c.email,
        cardHolderName: c.card_holder_name,
        totalAmount: parseFloat(c.total_donated),
        donationCount: c.donation_count,
        firstDonation: c.first_donation_at,
        lastDonation: c.last_donation_at,
        country: c.country,
        status: c.status || 'active',
        color: getRandomGradient(),
        paymentSource: latestPayment.payment_source || null,
        cardBrand: latestPayment.card_brand || null,
        storeDomain: latestPayment.store_domain || null
      };
    });
  } catch (err) {
    console.error('Get customers exception:', err);
    return [];
  }
}

async function getCustomerDetails(customerId) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .rpc('get_customer_details_rpc', { p_customer_id: customerId });

    if (error) {
      console.error('Get customer details error:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Get customer details exception:', err);
    return null;
  }
}

async function getAllPayments(campaignSlug = null) {
  if (!supabase) return [];

  try {
    let query = supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false });

    if (campaignSlug) {
      query = query.eq('source_ref', campaignSlug);
    }

    const { data, error } = await query;
    if (error) return [];

    return data.map(p => ({
      id: p.id,
      stripeChargeId: p.stripe_charge_id,
      stripePaymentIntentId: p.stripe_payment_intent_id,
      name: p.billing_name || p.customer_name,
      displayName: p.customer_name,
      initials: getInitials(p.billing_name || p.customer_name),
      email: p.customer_email,
      amount: parseFloat(p.amount),
      tipAmount: parseFloat(p.service_fee || 0),
      totalAmount: parseFloat(p.total_amount),
      stripeFee: parseFloat(p.stripe_fee || 0),
      netAmount: parseFloat(p.net_amount || p.total_amount),
      currency: p.currency || 'EUR',
      status: p.status,
      date: formatTimeAgo(p.created_at),
      rawDate: p.created_at,
      type: p.payment_source || 'card',
      donationType: 'one-time',
      campaign: p.source_ref,
      storeDomain: p.store_domain,
      color: getRandomGradient(),
      cardBrand: p.card_brand,
      cardLastDigits: p.card_last_digits,
      cardHolderName: p.card_holder_name,
      isAnonymous: p.guest_checkout,
      lineItems: p.line_items
    }));
  } catch (err) {
    console.error('Get payments exception:', err);
    return [];
  }
}

async function getPaymentDetails(paymentId) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*, customers(*)')
      .eq('id', paymentId)
      .single();

    if (error) return null;
    return data;
  } catch (err) {
    console.error('Get payment details exception:', err);
    return null;
  }
}

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

async function getRecentFailures(limit = 10) {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('payment_failures')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return data;
  } catch (err) {
    console.error('Get failures exception:', err);
    return [];
  }
}

async function deleteCustomer(customerId) {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    await supabase.rpc('delete_customer_cascade', { p_customer_id: customerId });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function toggleCustomerStatus(customerId, status) {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    const { error } = await supabase
      .from('customers')
      .update({ status })
      .eq('id', customerId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function updateCustomerNotes(customerId, notes) {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    const { error } = await supabase
      .from('customers')
      .update({ notes })
      .eq('id', customerId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

const { parseUserAgent } = require('./userAgentParser');

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

module.exports = {
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
  formatTimeAgo,
  getTimeBasedAnalytics,
  getDeviceBrowserAnalytics,
  createDonationToken,
  getNextStore,
  getStoreStats,
  toggleStoreStatus
};
