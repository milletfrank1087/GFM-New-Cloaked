const { supabase } = require('./db/client');
const {
  BASE_CURRENCY,
  convertToBase,
  convertPaymentsToBase,
  computePaymentAmounts,
  fetchLatestRates,
} = require('./fx');
const { syncAll, syncPreset, getPresetTtl, MIN_SYNC_INTERVAL_MS } = require('./ads-manager');

const PRESET_BY_RANGE = {
  today: 'today',
  yesterday: 'yesterday',
  last7days: 'last_7d',
  last30days: 'last_30d',
  thisMonth: 'this_month',
  lastMonth: 'last_month',
  thisYear: 'last_90d',
  allTime: 'last_90d',
};

function presetForRange(rangeKey) {
  return PRESET_BY_RANGE[rangeKey] || 'last_30d';
}

function presetDaySpan(preset) {
  const map = { today: 1, yesterday: 1, last_7d: 7, last_14d: 14, last_28d: 28, last_30d: 30, last_90d: 90 };
  return map[preset] || 30;
}

const PROFIT_FIELDS =
  'id, amount, service_fee, total_amount, stripe_fee, net_amount, created_at, ' +
  'currency, store_id, store_domain, source_ref, utm_campaign, status, ' +
  'billing_name, customer_name, stripe_subscription_id, payment_source';
const MAX_PAYMENTS = 5000;
const adRefreshInFlight = new Map();

function scheduleAdRefresh(preset) {
  if (adRefreshInFlight.has(preset)) return false;
  const task = syncPreset(preset)
    .catch((err) => console.warn(`[profit] background ${preset} sync note:`, err.message))
    .finally(() => adRefreshInFlight.delete(preset));
  adRefreshInFlight.set(preset, task);
  return true;
}

function toExclusiveEnd(endDate) {
  const s = String(endDate);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!dateOnly) return s;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return s;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

async function fetchPayments(campaignSlug, dateRange) {
  if (!supabase) return { rows: [], truncated: false, count: 0 };
  let query = supabase
    .from('payments')
    .select(PROFIT_FIELDS, { count: 'exact' })
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(MAX_PAYMENTS);
  if (campaignSlug && campaignSlug !== 'all') {
    query = query.or(`source_ref.eq.${campaignSlug},utm_campaign.eq.${campaignSlug}`);
  }
  if (dateRange?.startDate) query = query.gte('created_at', dateRange.startDate);
  if (dateRange?.endDate) {
    const end = toExclusiveEnd(dateRange.endDate);
    query = end === String(dateRange.endDate)
      ? query.lte('created_at', dateRange.endDate)
      : query.lt('created_at', end);
  }
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return {
    rows: data || [],
    count: count || 0,
    truncated: Number.isFinite(count) ? count > MAX_PAYMENTS : false,
  };
}

// Failed payment attempts (declines, 3DS not completed, checkout errors). Shown in the transactions feed
// only: they never count toward revenue, fees or profit.
const FAILURE_FIELDS =
  'id, created_at, source_ref, endpoint, stripe_payment_intent_id, error_type, error_code, error_message, ' +
  'request_amount, payment_method, error_details';
const MAX_FAILURES = 2000;

async function fetchFailures(campaignSlug, dateRange) {
  if (!supabase) return [];
  let query = supabase
    .from('payment_failures')
    .select(FAILURE_FIELDS)
    .order('created_at', { ascending: false })
    .limit(MAX_FAILURES);
  if (campaignSlug && campaignSlug !== 'all') query = query.eq('source_ref', campaignSlug);
  if (dateRange?.startDate) query = query.gte('created_at', dateRange.startDate);
  if (dateRange?.endDate) {
    const end = toExclusiveEnd(dateRange.endDate);
    query = end === String(dateRange.endDate)
      ? query.lte('created_at', dateRange.endDate)
      : query.lt('created_at', end);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

function failureTransaction(row, rates) {
  const d = row.error_details || {};
  const currency = String(d.currency || BASE_CURRENCY).toUpperCase();
  const amountNative = Number(row.request_amount) || 0;
  const amountBase = convertToBase(amountNative, currency, rates);
  return {
    id: `fail_${row.id}`,
    status: 'failed',
    name: null,
    campaign: row.source_ref || 'direct',
    storeDomain: 'unknown',
    currency,
    date: row.created_at,
    isSubscription: false,
    amountBase,
    tipBase: 0,
    grossBase: amountBase,
    feeBase: 0,
    netBase: 0,
    native: { amount: amountNative, tip: 0, gross: amountNative, fee: 0, net: 0, currency },
    fx: null,
    failure: {
      reason: d.decline_code || row.error_code || row.error_type || 'unknown',
      message: row.error_message || null,
      endpoint: row.endpoint || null,
      paymentIntent: row.stripe_payment_intent_id || null,
      method: row.payment_method || null,
      bankCode: d.network_decline_code || null,
      advice: d.advice_code || d.network_advice_code || null,
      cardCountry: d.card_country || null,
      cardBrand: d.card_brand || null,
      cardFunding: d.card_funding || null,
      last4: d.last4 || null,
      threeDS: d.tds_result ? `${d.tds_flow || ''} ${d.tds_result}`.trim() : null,
      risk: d.risk_level || null,
      wallet: d.wallet || null,
      device: d.device || null,
      attempt: d.attempt ?? null,
    },
  };
}

async function fetchAdSpendData(preset) {
  if (!supabase) return { spendRows: [], campaignRows: [] };
  const [spendRes, campRes] = await Promise.all([
    supabase
      .from('ad_spend')
      .select('campaign_id, date, spend, purchases_total, purchase_value_total, purchase_roas_total, cost_per_purchase, fetched_at')
      .eq('date_preset', preset),
    supabase
      .from('ad_campaigns')
      .select('id, name, account_id')
  ]);
  if (spendRes.error) throw new Error(spendRes.error.message);
  return {
    spendRows: spendRes.data || [],
    campaignRows: campRes.data || [],
  };
}

function emptyDaily() {
  const map = new Map();
  return {
    add(key, p) {
      if (!map.has(key)) {
        map.set(key, {
          date: key, count: 0, gross: 0, tips: 0, fees: 0, net: 0,
          spend: 0, profit: 0, byCurrency: {},
        });
      }
      const d = map.get(key);
      d.count += 1;
      d.gross += p.grossBase;
      d.tips += p.tipBase;
      d.fees += p.feeBase;
      d.net += p.netBase;
      const cur = p.currency || 'EUR';
      if (!d.byCurrency[cur]) {
        d.byCurrency[cur] = { count: 0, gross: 0, nativeGross: 0, fees: 0, nativeFees: 0, net: 0, nativeNet: 0 };
      }
      const { grossNative, feeNative, netNative } = computePaymentAmounts(p.raw);
      d.byCurrency[cur].count += 1;
      d.byCurrency[cur].gross += p.grossBase;
      d.byCurrency[cur].nativeGross += grossNative;
      d.byCurrency[cur].fees += p.feeBase;
      d.byCurrency[cur].nativeFees += feeNative;
      d.byCurrency[cur].net += p.netBase;
      d.byCurrency[cur].nativeNet += netNative;
      return d;
    },
    get map() { return map; },
  };
}

function getLocalHourAndDate(isoString, tzOffsetMinutes = 0) {
  if (!isoString) return { dateKey: 'unknown', hourKey: '00:00' };
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return { dateKey: 'unknown', hourKey: '00:00' };
  // tzOffsetMinutes from client (e.g. -180 for UTC+3)
  const localMs = d.getTime() - (tzOffsetMinutes * 60000);
  const localDate = new Date(localMs);
  const dateKey = localDate.toISOString().slice(0, 10);
  const hourKey = String(localDate.getUTCHours()).padStart(2, '0') + ':00';
  return { dateKey, hourKey };
}

async function getProfitOverview(campaignSlug = null, dateRange = null, { withAdSpend = true, forceAdRefresh = false, rangeKey = 'last30days', tzOffset = 0 } = {}) {
  const preset = process.env.ADS_DEFAULT_PRESET || presetForRange(rangeKey);
  const AD_SPEND_CURRENCY = 'USD';
  const tzOffsetMinutes = Number(tzOffset) || 0;

  if (withAdSpend && forceAdRefresh) {
    try {
      await syncPreset(preset, { force: true, refresh: true });
    } catch (err) {
      console.warn(`[profit] forced ${preset} sync note:`, err.message);
    }
  }

  const [paymentResult, adDataResult, latestRatesResult, failureRows] = await Promise.all([
    fetchPayments(campaignSlug, dateRange),
    withAdSpend ? fetchAdSpendData(preset) : Promise.resolve({ spendRows: [], campaignRows: [] }),
    fetchLatestRates().catch(() => null),
    fetchFailures(campaignSlug, dateRange).catch((err) => {
      console.warn('[profit] failures not loaded:', err.message);
      return [];
    }),
  ]);

  const payments = paymentResult.rows;
  const convertedPayments = await convertPaymentsToBase(payments);

  const isSingleDay = rangeKey === 'today' || rangeKey === 'yesterday';
  const daily = emptyDaily();
  const hourly = emptyDaily();
  const perCampaign = new Map();
  const perStore = new Map();
  const currencyBreakdown = {};
  let total = {
    count: 0, gross: 0, tips: 0, fees: 0, net: 0,
    metaPurchases: 0, metaPurchaseValue: 0, metaSpend: 0,
  };

  for (const p of convertedPayments) {
    const { dateKey, hourKey } = getLocalHourAndDate(p.raw.created_at, tzOffsetMinutes);
    total.count += 1;
    total.gross += p.grossBase;
    total.tips += p.tipBase;
    total.fees += p.feeBase;
    total.net += p.netBase;

    daily.add(dateKey, p);
    hourly.add(hourKey, p);

    const raw = p.raw;
    const cur = p.currency || BASE_CURRENCY;
    const { donationNative, tipNative, grossNative, feeNative, netNative } = computePaymentAmounts(p.raw);

    const campaignKey = raw.source_ref || raw.utm_campaign || 'direct';
    if (!perCampaign.has(campaignKey)) {
      perCampaign.set(campaignKey, {
        key: campaignKey, name: null, count: 0, gross: 0, tips: 0, fees: 0, net: 0,
        spend: 0, spendNative: 0, profit: 0, purchases: 0, roas: null, cpa: null, isAdCampaign: false,
        utmCampaignId: raw.utm_campaign || null,
        byCurrency: {},
      });
    }
    const c = perCampaign.get(campaignKey);
    c.count += 1;
    c.gross += p.grossBase;
    c.tips += p.tipBase;
    c.fees += p.feeBase;
    c.net += p.netBase;
    if (!c.byCurrency[cur]) {
      c.byCurrency[cur] = { count: 0, gross: 0, tips: 0, fees: 0, net: 0, nativeGross: 0, nativeTips: 0, nativeFees: 0, nativeNet: 0 };
    }
    c.byCurrency[cur].count += 1;
    c.byCurrency[cur].gross += p.grossBase;
    c.byCurrency[cur].tips += p.tipBase;
    c.byCurrency[cur].fees += p.feeBase;
    c.byCurrency[cur].net += p.netBase;
    c.byCurrency[cur].nativeGross += grossNative;
    c.byCurrency[cur].nativeTips += tipNative;
    c.byCurrency[cur].nativeFees += feeNative;
    c.byCurrency[cur].nativeNet += netNative;

    const storeKey = raw.store_domain || 'unknown';
    if (!perStore.has(storeKey)) {
      perStore.set(storeKey, { domain: storeKey, count: 0, gross: 0, tips: 0, fees: 0, net: 0, byCurrency: {} });
    }
    const s = perStore.get(storeKey);
    s.count += 1;
    s.gross += p.grossBase;
    s.tips += p.tipBase;
    s.fees += p.feeBase;
    s.net += p.netBase;
    if (!s.byCurrency[cur]) {
      s.byCurrency[cur] = { count: 0, gross: 0, tips: 0, fees: 0, net: 0, nativeGross: 0, nativeTips: 0, nativeFees: 0, nativeNet: 0 };
    }
    s.byCurrency[cur].count += 1;
    s.byCurrency[cur].gross += p.grossBase;
    s.byCurrency[cur].tips += p.tipBase;
    s.byCurrency[cur].fees += p.feeBase;
    s.byCurrency[cur].net += p.netBase;
    s.byCurrency[cur].nativeGross += grossNative;
    s.byCurrency[cur].nativeTips += tipNative;
    s.byCurrency[cur].nativeFees += feeNative;
    s.byCurrency[cur].nativeNet += netNative;

    if (!currencyBreakdown[cur]) {
      currencyBreakdown[cur] = {
        count: 0, gross: 0, tips: 0, fees: 0, net: 0,
        nativeGross: 0, nativeTips: 0, nativeFees: 0, nativeNet: 0, rateDate: p.fx?.rateDate || null,
        rate: p.fx?.rate || null, fxSource: p.fx?.source || null,
      };
    }
    const cb = currencyBreakdown[cur];
    cb.count += 1;
    cb.gross += p.grossBase;
    cb.tips += p.tipBase;
    cb.fees += p.feeBase;
    cb.net += p.netBase;
    cb.nativeGross += grossNative;
    cb.nativeTips += tipNative;
    cb.nativeFees += feeNative;
    cb.nativeNet += netNative;
    if (p.fx?.rateDate && cb.rateDate && cb.rateDate !== p.fx.rateDate) {
      cb.rateDate = 'multiple dates';
      cb.rate = null;
    } else if (!cb.rateDate) {
      cb.rateDate = p.fx.rateDate || null;
      cb.rate = p.fx.rate || null;
    }
    cb.fxSource = p.fx?.source || cb.fxSource;
  }

  const dailyRows = [...daily.map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const hourlyRows = Array.from({ length: 24 }, (_, i) => {
    const hk = String(i).padStart(2, '0') + ':00';
    return hourly.map.get(hk) || { date: hk, count: 0, gross: 0, tips: 0, fees: 0, net: 0, spend: 0, profit: 0, byCurrency: {} };
  });

  let totalSpend = 0;
  let totalSpendNative = 0;
  let spendFreshAt = null;
  let adRefreshScheduled = false;
  let spendToBaseRate = 1;
  const ttl = getPresetTtl(preset);
  let isStale = false;

  if (withAdSpend) {
    if (latestRatesResult && latestRatesResult[AD_SPEND_CURRENCY]) {
      spendToBaseRate = convertToBase(1, AD_SPEND_CURRENCY, latestRatesResult);
    }

    const { spendRows, campaignRows } = adDataResult;
    const nameById = new Map((campaignRows || []).map(c => [c.id, c.name]));
    const spendByCampaign = new Map();
    let latestFetchedAt = 0;

    for (const row of spendRows || []) {
      const fetchedAt = Date.parse(row.fetched_at || '');
      if (Number.isFinite(fetchedAt)) latestFetchedAt = Math.max(latestFetchedAt, fetchedAt);
      if (!spendByCampaign.has(row.campaign_id)) {
        spendByCampaign.set(row.campaign_id, {
          campaignId: row.campaign_id,
          spend: 0, spendNative: 0, purchases: 0, value: 0, roas: null, cpa: null,
        });
      }
      const s = spendByCampaign.get(row.campaign_id);
      s.spendNative += Number(row.spend || 0);
      s.spend += Number(row.spend || 0) * spendToBaseRate;
      s.purchases += Number(row.purchases_total || 0);
      s.value += Number(row.purchase_value_total || 0) * spendToBaseRate;
      if (row.purchase_roas_total) s.roas = Number(row.purchase_roas_total);
      if (row.cost_per_purchase) s.cpa = Number(row.cost_per_purchase) * spendToBaseRate;
    }

    spendFreshAt = latestFetchedAt || null;
    isStale = !latestFetchedAt || (Date.now() - latestFetchedAt > ttl);
    if ((spendRows || []).length === 0 || isStale) {
      adRefreshScheduled = scheduleAdRefresh(preset);
    }

    for (const [key, agg] of perCampaign) {
      const spendInfo = spendByCampaign.get(agg.utmCampaignId || key);
      if (spendInfo) {
        agg.spend = spendInfo.spend;
        agg.spendNative = spendInfo.spendNative;
        agg.purchases = spendInfo.purchases;
        agg.purchaseValue = spendInfo.value;
        agg.roas = spendInfo.roas;
        agg.cpa = spendInfo.cpa;
        agg.name = nameById.get(agg.utmCampaignId || key) || null;
        agg.isAdCampaign = true;
      }
    }

    for (const [campaignId, spendInfo] of spendByCampaign) {
      const isInSelectedScope = !campaignSlug || campaignSlug === 'all' || campaignSlug === campaignId;
      const alreadyMerged = [...perCampaign.values()].some(a => a.utmCampaignId === campaignId);
      if (!isInSelectedScope || perCampaign.has(campaignId) || alreadyMerged) continue;
      perCampaign.set(campaignId, {
        key: campaignId,
        name: nameById.get(campaignId) || campaignId,
        count: 0,
        gross: 0,
        tips: 0,
        fees: 0,
        net: 0,
        spend: spendInfo.spend,
        spendNative: spendInfo.spendNative,
        profit: -spendInfo.spend,
        purchases: spendInfo.purchases,
        purchaseValue: spendInfo.value,
        roas: spendInfo.roas,
        cpa: spendInfo.cpa,
        isAdCampaign: true,
      });
    }
  }

  totalSpend = 0;
  totalSpendNative = 0;
  for (const c of perCampaign.values()) {
    c.profit = c.net - c.spend;
    totalSpend += c.spend;
    totalSpendNative += c.spendNative || 0;
    total.metaPurchases += c.purchases || 0;
    total.metaPurchaseValue += c.purchaseValue || 0;
  }
  total.metaSpend = totalSpend;

  const campaignRows = [...perCampaign.values()]
    .sort((a, b) => b.net - a.net)
    .map(c => ({
      ...c,
      cpa: c.cpa,
      roas: c.roas,
    }));

  const storeRows = [...perStore.values()].sort((a, b) => b.gross - a.gross);

  const allTransactions = convertedPayments.map((p) => {
    const { donationNative, tipNative, grossNative, feeNative, netNative } = computePaymentAmounts(p.raw);
    const isSub = Boolean(p.raw.stripe_subscription_id) || p.raw.payment_source === 'subscription';
    return {
      id: p.raw.id,
      name: p.raw.billing_name || p.raw.customer_name || null,
      campaign: p.raw.source_ref || p.raw.utm_campaign || 'direct',
      storeDomain: p.raw.store_domain || 'unknown',
      currency: p.currency,
      date: p.raw.created_at,
      isSubscription: isSub,
      amountBase: p.amountBase,
      tipBase: p.tipBase,
      grossBase: p.grossBase,
      feeBase: p.feeBase,
      netBase: p.netBase,
      native: {
        amount: donationNative,
        tip: tipNative,
        gross: grossNative,
        fee: feeNative,
        net: netNative,
        currency: p.currency,
      },
      fx: p.fx,
      status: 'completed',
    };
  });

  // Failed attempts are merged into the feed by time; totals above stay completed-only.
  const failedTransactions = failureRows.map((row) => failureTransaction(row, latestRatesResult));
  const feed = allTransactions.concat(failedTransactions)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    baseCurrency: BASE_CURRENCY,
    range: { start: dateRange?.startDate || null, end: dateRange?.endDate || null },
    isSingleDay,
    totals: {
      count: total.count,
      gross: total.gross,
      tips: total.tips,
      fees: total.fees,
      net: total.net,
      spend: totalSpend,
      spendNative: totalSpendNative,
      spendCurrency: 'USD',
      profit: total.net - totalSpend,
      metaPurchases: total.metaPurchases,
      metaPurchaseValue: total.metaPurchaseValue,
    },
    daily: isSingleDay ? hourlyRows : dailyRows,
    timelineType: isSingleDay ? 'hourly' : 'daily',
    perCampaign: campaignRows,
    perStore: storeRows,
    currencyBreakdown,
    recent: allTransactions.slice(0, 15),
    transactions: feed,
    totalTransactionsCount: paymentResult.count,
    failedCount: failedTransactions.length,
    failedAmount: failedTransactions.reduce((s, t) => s + t.amountBase, 0),
    adSync: {
      preset,
      presetDays: presetDaySpan(preset),
      currency: AD_SPEND_CURRENCY,
      ttlMs: ttl,
      isStale,
      fx: {
        baseCurrency: BASE_CURRENCY,
        nativePerBase: spendToBaseRate ? 1 / spendToBaseRate : null,
        basePerNative: spendToBaseRate,
        source: 'Frankfurter latest',
      },
      asOf: new Date().toISOString(),
      fetchedAt: spendFreshAt ? new Date(spendFreshAt).toISOString() : null,
      refreshing: adRefreshScheduled || adRefreshInFlight.has(preset),
    },
    dataQuality: {
      paymentsTruncated: paymentResult.truncated,
      maxPayments: MAX_PAYMENTS,
    },
  };
}

async function getChartTimeline(campaignSlug = null, chartRange = '7d', tzOffset = 0) {
  const now = new Date();
  const tzOffsetMinutes = Number(tzOffset) || 0;
  // Local today calculation
  const localNowMs = now.getTime() - (tzOffsetMinutes * 60000);
  const localNow = new Date(localNowMs);
  const localTodayStartUtcMs = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) + (tzOffsetMinutes * 60000);
  const todayStart = new Date(localTodayStartUtcMs);

  let dateRange = null;
  let isHourly = false;

  if (chartRange === '24h' || chartRange === 'today_hourly' || chartRange === 'today') {
    dateRange = { startDate: todayStart.toISOString(), endDate: now.toISOString() };
    isHourly = true;
  } else if (chartRange === 'yesterday_hourly' || chartRange === 'yesterday') {
    const yStart = new Date(todayStart.getTime() - 86400000);
    const yEnd = new Date(todayStart.getTime() - 1);
    dateRange = { startDate: yStart.toISOString(), endDate: yEnd.toISOString() };
    isHourly = true;
  } else if (chartRange === '7d' || chartRange === 'last7days') {
    dateRange = { startDate: new Date(todayStart.getTime() - 6 * 86400000).toISOString(), endDate: now.toISOString() };
  } else if (chartRange === '14d') {
    dateRange = { startDate: new Date(todayStart.getTime() - 13 * 86400000).toISOString(), endDate: now.toISOString() };
  } else if (chartRange === '30d' || chartRange === 'last30days') {
    dateRange = { startDate: new Date(todayStart.getTime() - 29 * 86400000).toISOString(), endDate: now.toISOString() };
  } else if (chartRange === '90d' || chartRange === 'thisYear') {
    dateRange = { startDate: new Date(todayStart.getTime() - 89 * 86400000).toISOString(), endDate: now.toISOString() };
  }

  const paymentResult = await fetchPayments(campaignSlug, dateRange);
  const converted = await convertPaymentsToBase(paymentResult.rows);

  if (isHourly) {
    const hourly = emptyDaily();
    for (const p of converted) {
      const { hourKey } = getLocalHourAndDate(p.raw.created_at, tzOffsetMinutes);
      hourly.add(hourKey, p);
    }
    const hourlyRows = Array.from({ length: 24 }, (_, i) => {
      const hk = String(i).padStart(2, '0') + ':00';
      return hourly.map.get(hk) || { date: hk, count: 0, gross: 0, tips: 0, fees: 0, net: 0, spend: 0, profit: 0 };
    });
    return { timeline: hourlyRows, type: 'hourly', chartRange };
  } else {
    const daily = emptyDaily();
    for (const p of converted) {
      const { dateKey } = getLocalHourAndDate(p.raw.created_at, tzOffsetMinutes);
      daily.add(dateKey, p);
    }
    const dailyRows = [...daily.map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
    return { timeline: dailyRows, type: 'daily', chartRange };
  }
}

async function triggerAdSync() {
  try {
    const result = await syncAll();
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  getProfitOverview,
  getChartTimeline,
  triggerAdSync,
  MAX_PAYMENTS,
  presetForRange,
  presetDaySpan,
};
