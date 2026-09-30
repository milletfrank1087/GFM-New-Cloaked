/* Profit Cockpit v2 data: per market, per Europe/Athens day facts for the last N days.
   Everything the page shows (KPIs, deltas, charts, market table, Meta vs reality, alerts) is derived
   in the browser from this one payload, so the page stays consistent across filters. */
const { supabase } = require('./db/client');
const { convertPaymentsToBase, convertToBase, fetchLatestRates } = require('./fx');

const TZ = 'Europe/Athens';
const DAY_MS = 86400000;
const CACHE_MS = 60 * 1000;
const FUNNEL_EVENTS = ['ViewContent', 'AddPaymentInfo', 'Purchase'];
const cache = new Map();

const ymd = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const hourIn = (ms) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)));
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

function offsetMin(ms) {
  const v = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).find(p => p.type === 'timeZoneName')?.value || 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(v);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
}
// UTC instant of 00:00 Athens on `day` (DST-safe).
function athensMidnight(day) {
  const utc = Date.parse(`${day}T00:00:00Z`);
  return new Date(utc - offsetMin(utc - 3 * 3600000) * 60000).toISOString();
}

// Paged read with a stable order: without it PostgREST can repeat/skip rows across pages.
async function readAll(table, cols, apply, orderCol = 'created_at', tieCol = 'id') {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(cols);
    q = apply(q).order(orderCol, { ascending: true }).order(tieCol, { ascending: true }).range(from, from + 999);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

async function build(days) {
  const now = Date.now();
  const today = ymd(now);
  const dayList = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
  const since = athensMidnight(dayList[0]);
  const idx = new Map(dayList.map((d, i) => [d, i]));

  const [payments, spendRows, adCampaigns, funnel, failures, rates] = await Promise.all([
    readAll('payments', 'id, amount, service_fee, total_amount, stripe_fee, net_amount, created_at, currency, store_domain, source_ref, utm_campaign',
      q => q.eq('status', 'completed').gte('created_at', since)),
    // Daily rows written by ads-manager (date_preset 'day:YYYY-MM-DD'); amounts in USD.
    readAll('ad_spend', 'campaign_id, date, spend, purchases_total, purchase_value_total, fetched_at',
      q => q.like('date_preset', 'day:%').gte('date', dayList[0]), 'date', 'campaign_id'),
    supabase.from('ad_campaigns').select('id, name').then(r => r.data || []),
    readAll('funnel_events', 'id, created_at, campaign_slug, event_type, visitor_id',
      q => q.gte('created_at', since).in('event_type', FUNNEL_EVENTS)),
    readAll('payment_failures', 'id, created_at, error_code, source_ref', q => q.gte('created_at', since)),
    fetchLatestRates().catch(() => null),
  ]);

  const usdToEur = rates && rates.USD ? convertToBase(1, 'USD', rates) : 1;
  const converted = await convertPaymentsToBase(payments);

  // Meta campaign id -> market slug, by majority of payments that carried both (utm_campaign, source_ref).
  const votes = new Map();
  for (const p of payments) {
    if (!p.utm_campaign || !p.source_ref || p.utm_campaign === p.source_ref) continue;
    const v = votes.get(p.utm_campaign) || new Map();
    v.set(p.source_ref, (v.get(p.source_ref) || 0) + 1);
    votes.set(p.utm_campaign, v);
  }
  const slugOf = new Map([...votes].map(([id, v]) => [id, [...v].sort((a, b) => b[1] - a[1])[0][0]]));
  const nameOf = new Map(adCampaigns.map(c => [String(c.id), c.name]));

  const markets = new Map();
  const blank = () => ({ spend: 0, gross: 0, net: 0, fees: 0, tips: 0, n: 0, mp: 0, mv: 0, v: new Set(), a: new Set(), p: new Set() });
  const cell = (key, day, name) => {
    if (!idx.has(day)) return null;
    if (!markets.has(key)) markets.set(key, { key, name: name || key, metaIds: new Set(), days: dayList.map(blank) });
    const m = markets.get(key);
    if (name && m.name === key) m.name = name;
    return m.days[idx.get(day)];
  };

  let adSyncAt = 0;
  for (const r of spendRows) {
    const id = String(r.campaign_id);
    const key = slugOf.get(id) || `meta:${id}`;
    const c = cell(key, String(r.date).slice(0, 10), nameOf.get(id));
    if (!c) continue;
    markets.get(key).metaIds.add(id);
    c.spend += Number(r.spend || 0) * usdToEur;
    c.mp += Number(r.purchases_total || 0);
    c.mv += Number(r.purchase_value_total || 0) * usdToEur;
    adSyncAt = Math.max(adSyncAt, Date.parse(r.fetched_at) || 0);
  }

  const hourly = { today: Array(24).fill(0), yesterday: Array(24).fill(0), todayN: Array(24).fill(0), yesterdayN: Array(24).fill(0) };
  const recentStores = new Set();
  for (const p of converted) {
    const ms = Date.parse(p.raw.created_at);
    const day = ymd(ms);
    const c = cell(p.raw.source_ref || p.raw.utm_campaign || 'direct', day);
    if (!c) continue;
    c.gross += p.grossBase; c.net += p.netBase; c.fees += p.feeBase; c.tips += p.tipBase; c.n += 1;
    const which = day === today ? 'today' : day === dayList[days - 2] ? 'yesterday' : null;
    if (which) { const h = hourIn(ms); hourly[which][h] += p.netBase; hourly[`${which}N`][h] += 1; }
    if (now - ms < 7 * DAY_MS && p.raw.store_domain) recentStores.add(p.raw.store_domain);
  }
  for (const k of ['today', 'yesterday']) {
    for (let h = 1; h < 24; h++) { hourly[k][h] += hourly[k][h - 1]; hourly[`${k}N`][h] += hourly[`${k}N`][h - 1]; }
  }

  for (const e of funnel) {
    if (!e.campaign_slug) continue;
    const c = cell(e.campaign_slug, ymd(Date.parse(e.created_at)));
    if (!c) continue;
    const set = e.event_type === 'ViewContent' ? c.v : e.event_type === 'AddPaymentInfo' ? c.a : c.p;
    set.add(e.visitor_id || e.id);
  }

  const failuresByDay = {};
  for (const f of failures) {
    const d = ymd(Date.parse(f.created_at));
    const o = (failuresByDay[d] ||= {});
    o[f.error_code || 'unknown'] = (o[f.error_code || 'unknown'] || 0) + 1;
  }

  const r2 = (x) => Math.round(x * 100) / 100;
  const campaigns = [...markets.values()]
    .map(m => ({
      key: m.key, name: m.name, metaCampaignIds: [...m.metaIds],
      days: m.days.map((x, i) => ({
        d: dayList[i], spend: r2(x.spend), gross: r2(x.gross), net: r2(x.net), fees: r2(x.fees), tips: r2(x.tips), n: x.n,
        mp: x.mp, mv: r2(x.mv), visitors: x.v.size, addPay: x.a.size, purchases: x.p.size,
      })),
    }))
    .filter(c => c.days.some(x => x.spend > 0 || x.n > 0));

  return {
    days: dayList, today, hourNow: hourIn(now), hourly,
    storeCount: recentStores.size,
    adSyncAt: adSyncAt ? new Date(adSyncAt).toISOString() : null,
    fx: { usdToEur },
    campaigns, failures: failuresByDay, generated: new Date(now).toISOString(),
  };
}

async function getCockpitData(days = 14) {
  const n = Math.min(Math.max(Number(days) || 14, 7), 60);
  const hit = cache.get(n);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = build(n);
  cache.set(n, { at: Date.now(), promise });
  promise.catch(() => cache.delete(n));
  return promise;
}

module.exports = { getCockpitData };
