const { supabase } = require('./db/client');
const {
  BASE_CURRENCY,
  convertToBase,
  convertPaymentsToBase,
  dayKey,
  fetchLatestRates,
} = require('./fx');
const { syncAll, syncPreset } = require('./ads-manager');

const PRESET_BY_RANGE = {
  today: 'today',
  yesterday: 'yesterday',
  last7days: 'last_7d',
  last30days: 'last_30d',
  thisMonth: 'last_30d',
  lastMonth: 'last_30d',
  thisYear: 'last_90d',
  allTime: 'last_90d',
};

function presetForRange(rangeKey) {
  return PRESET_BY_RANGE[rangeKey] || 'last_30d';
}

function presetDaySpan(preset) {
  const map = { today: 1, yesterday: 1, last_7d: 7, last_14d: 14, last_28d: 28, last_30d: 30, last_90d: 90, this_week_mon_today: 7, this_week_sun_today: 7 };
  return map[preset] || 30;
}

const PROFIT_FIELDS =
  'id, amount, service_fee, total_amount, stripe_fee, net_amount, created_at, ' +
  'currency, store_id, store_domain, source_ref, utm_campaign, status, ' +
  'billing_name, customer_name';
const MAX_PAYMENTS = 5000;
const ADS_SYNC_TTL_MS = 5 * 60 * 1000;
const adRefreshInFlight = new Map();

function scheduleAdRefresh(preset) {
  if (adRefreshInFlight.has(preset)) return false;
  const task = syncPreset(preset)
    .catch((err) => console.warn(`[profit] background ${preset} sync failed:`, err.message))
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
  if (!supabase) return { rows: [], truncated: false };
  let query = supabase
    .from('payments')
    .select(PROFIT_FIELDS, { count: 'exact' })
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(MAX_PAYMENTS);
  if (campaignSlug && campaignSlug !== 'all') query = query.eq('source_ref', campaignSlug);
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
    truncated: Number.isFinite(count) ? count > MAX_PAYMENTS : false,
  };
}

function emptyDaily() {
  const map = new Map();
  return {
    add(date, p) {
      if (!map.has(date)) {
        map.set(date, {
          date, count: 0, gross: 0, tips: 0, fees: 0, net: 0,
          spend: 0, profit: 0, byCurrency: {},
        });
      }
      const d = map.get(date);
      d.count += 1;
      d.gross += p.grossBase;
      d.tips += p.tipBase;
      d.fees += p.feeBase;
      d.net += p.netBase;
      if (!d.byCurrency[p.currency]) d.byCurrency[p.currency] = 0;
      d.byCurrency[p.currency] += p.grossBase;
      return d;
    },
    get map() { return map; },
  };
}

async function getProfitOverview(campaignSlug = null, dateRange = null, { withAdSpend = true, rangeKey = 'last30days' } = {}) {
  const paymentResult = await fetchPayments(campaignSlug, dateRange);
  const payments = paymentResult.rows;
  const convertedPayments = await convertPaymentsToBase(payments);

  const daily = emptyDaily();
  const perCampaign = new Map();
  const perStore = new Map();
  const currencyBreakdown = {};
  let total = {
    count: 0, gross: 0, tips: 0, fees: 0, net: 0,
    metaPurchases: 0, metaPurchaseValue: 0, metaSpend: 0,
  };

  for (const p of convertedPayments) {
    const dateKey = p.date;
    total.count += 1;
    total.gross += p.grossBase;
    total.tips += p.tipBase;
    total.fees += p.feeBase;
    total.net += p.netBase;

    daily.add(dateKey, p);

    const raw = p.raw;
    const campaignKey = raw.utm_campaign || raw.source_ref || 'direct';
    if (!perCampaign.has(campaignKey)) {
      perCampaign.set(campaignKey, {
        key: campaignKey, name: null, count: 0, gross: 0, tips: 0, fees: 0, net: 0,
        spend: 0, spendNative: 0, profit: 0, purchases: 0, roas: null, cpa: null, isAdCampaign: false,
      });
    }
    const c = perCampaign.get(campaignKey);
    c.count += 1;
    c.gross += p.grossBase;
    c.tips += p.tipBase;
    c.fees += p.feeBase;
    c.net += p.netBase;

    const storeKey = raw.store_domain || 'unknown';
    if (!perStore.has(storeKey)) {
      perStore.set(storeKey, { domain: storeKey, count: 0, gross: 0, tips: 0, fees: 0, net: 0 });
    }
    const s = perStore.get(storeKey);
    s.count += 1;
    s.gross += p.grossBase;
    s.tips += p.tipBase;
    s.fees += p.feeBase;
    s.net += p.netBase;

    const cur = p.currency || BASE_CURRENCY;
    if (!currencyBreakdown[cur]) {
      currencyBreakdown[cur] = {
        count: 0, gross: 0, tips: 0, fees: 0, net: 0,
        nativeGross: 0, nativeFees: 0, nativeNet: 0, rateDate: p.fx?.rateDate || null,
        rate: p.fx?.rate || null, fxSource: p.fx?.source || null,
      };
    }
    const cb = currencyBreakdown[cur];
    cb.count += 1;
    cb.gross += p.grossBase;
    cb.tips += p.tipBase;
    cb.fees += p.feeBase;
    cb.net += p.netBase;
    cb.nativeGross += parseFloat(p.raw.total_amount || 0);
    cb.nativeFees += parseFloat(p.raw.stripe_fee || 0);
    cb.nativeNet += parseFloat(p.raw.net_amount ?? p.raw.total_amount ?? 0);
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

  let totalSpend = 0;
  let totalSpendNative = 0;
  let spendFreshAt = null;
  let adRefreshScheduled = false;
  const preset = process.env.ADS_DEFAULT_PRESET || presetForRange(rangeKey);
  const AD_SPEND_CURRENCY = 'USD';
  let spendToBaseRate = 1;

  if (withAdSpend) {
    try {
      const latest = await fetchLatestRates();
      if (latest && latest[AD_SPEND_CURRENCY]) {
        spendToBaseRate = convertToBase(1, AD_SPEND_CURRENCY, latest);
      }
    } catch (err) {
      console.warn('[profit] ad spend FX failed:', err.message);
    }

    async function joinSpend() {
      const { data: spendRows, error } = await supabase
        .from('ad_spend')
        .select('campaign_id, date, spend, purchases_total, purchase_value_total, purchase_roas_total, cost_per_purchase, fetched_at')
        .eq('date_preset', preset);
      if (error) throw new Error(error.message);
      const { data: campaignRows } = await supabase
        .from('ad_campaigns')
        .select('id, name, account_id');
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

      let joined = 0;
      for (const [key, agg] of perCampaign) {
        const campaignId = key;
        const spendInfo = spendByCampaign.get(campaignId);
        if (spendInfo) {
          agg.spend = spendInfo.spend;
          agg.spendNative = spendInfo.spendNative;
          agg.purchases = spendInfo.purchases;
          agg.purchaseValue = spendInfo.value;
          agg.roas = spendInfo.roas;
          agg.cpa = spendInfo.cpa;
          agg.name = nameById.get(campaignId) || null;
          agg.isAdCampaign = true;
          joined += 1;
        }
      }
      for (const [campaignId, spendInfo] of spendByCampaign) {
        const isInSelectedScope = !campaignSlug || campaignSlug === 'all' || campaignSlug === campaignId;
        if (!isInSelectedScope || perCampaign.has(campaignId)) continue;
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
      return {
        spendByCampaign,
        joined,
        rowCount: (spendRows || []).length,
        latestFetchedAt,
        stale: !latestFetchedAt || Date.now() - latestFetchedAt > ADS_SYNC_TTL_MS,
      };
    }

    try {
      const first = await joinSpend();
      spendFreshAt = first.latestFetchedAt || null;
      totalSpend = 0;
      for (const s of first.spendByCampaign.values()) totalSpend += s.spend;
      if (first.rowCount === 0 || first.stale) {
        console.log(`[profit] preset ${preset} ${first.rowCount === 0 ? 'empty' : 'stale'} — syncing selected ad preset`);
        adRefreshScheduled = scheduleAdRefresh(preset);
      }
    } catch (err) {
      console.warn('[profit] ad spend join failed:', err.message);
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

  const recent = convertedPayments.slice(0, 10).map((p) => ({
    id: p.raw.id,
    name: p.raw.billing_name || p.raw.customer_name || null,
    currency: p.currency,
    date: p.raw.created_at,
    amountBase: p.amountBase,
    tipBase: p.tipBase,
    grossBase: p.grossBase,
    feeBase: p.feeBase,
    netBase: p.netBase,
    native: {
      amount: parseFloat(p.raw.amount || 0),
      tip: parseFloat(p.raw.service_fee || 0),
      gross: parseFloat(p.raw.total_amount || 0),
      fee: parseFloat(p.raw.stripe_fee || 0),
      net: parseFloat(p.raw.net_amount ?? p.raw.total_amount ?? 0),
      currency: p.currency,
    },
    fx: p.fx,
  }));

  return {
    baseCurrency: BASE_CURRENCY,
    range: { start: dateRange?.startDate || null, end: dateRange?.endDate || null },
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
    daily: dailyRows,
    perCampaign: campaignRows,
    perStore: storeRows,
    currencyBreakdown,
    recent,
    adSync: {
      preset,
      presetDays: presetDaySpan(preset),
      currency: AD_SPEND_CURRENCY,
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

async function triggerAdSync() {
  try {
    const result = await syncAll();
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { getProfitOverview, triggerAdSync, MAX_PAYMENTS, presetForRange, presetDaySpan };
