// Backfill daily spend rows in ad_spend (date_preset 'day:YYYY-MM-DD') from the Meta Graph API: reads Meta, writes Supabase.
// Meta reports hours in the ad account's timezone; they are re-bucketed into Europe/Athens days to match
// the cockpit (same approach as fb-ads-manager's adInsights.js). Today is skipped: the sync worker owns it.
// Usage: node tools/backfill-ad-spend-daily.js [days=30] [--dry]
const fs = require('fs');
const path = require('path');
process.chdir(path.join(__dirname, '..', 'campaign'));
require('dotenv').config({ path: '.env', quiet: true });
const { createClient } = require('@supabase/supabase-js');

const env = Object.fromEntries(fs.readFileSync('C:/Users/iakwv/Downloads/FB ads manager/.env', 'utf8')
  .split('\n').map(l => l.replace('\r', '')).filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const TOKEN = env.FB_SYSTEM_USER_ACCESS_TOKEN || env.FB_USER_ACCESS_TOKEN;
const V = env.GRAPH_API_VERSION || 'v21.0';
// Local .env only lists the old primary account; the live campaigns run in act_1388808955587972 (GFM Italy).
const ACCOUNTS = [...new Set([env.FB_PRIMARY_ACCOUNT_ID, env.FB_AD_ACCOUNT_ID, ...(env.FB_ADDITIONAL_ACCOUNT_IDS || '').split(','), 'act_1388808955587972']
  .map(a => String(a || '').trim()).filter(Boolean).map(a => a.startsWith('act_') ? a : 'act_' + a))];
const DAYS = Number(process.argv[2]) || 30;
const DRY = process.argv.includes('--dry');
const TZ = 'Europe/Athens';

const ymd = (ms, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
function offsetMin(tz, ms) {
  const v = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).find(p => p.type === 'timeZoneName')?.value || 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(v);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
}
// UTC ms of `date hour:00` wall-clock time in `tz`.
function wallToUtc(date, hour, tz) {
  const guess = Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  return guess - offsetMin(tz, guess - offsetMin(tz, guess) * 60000) * 60000;
}
const act = (list, types) => (list || []).filter(a => types.includes(a.action_type)).reduce((s, a) => s + Number(a.value || 0), 0);

async function get(url) {
  const out = [];
  while (url) {
    const j = await (await fetch(url)).json();
    if (j.error) throw new Error(j.error.message);
    out.push(...(j.data || [])); url = j.paging && j.paging.next;
  }
  return out;
}

(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const today = ymd(Date.now(), TZ);
  const first = addDays(today, -DAYS), last = addDays(today, -1);
  const rows = new Map();
  const names = new Map();
  for (const acct of ACCOUNTS) {
    let acctTz;
    let data;
    try {
      const info = await (await fetch(`https://graph.facebook.com/${V}/${acct}?fields=timezone_name&access_token=${TOKEN}`)).json();
      if (info.error) throw new Error(info.error.message);
      acctTz = info.timezone_name || 'UTC';
      const qs = new URLSearchParams({
        level: 'campaign', time_increment: 1, breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
        time_range: JSON.stringify({ since: addDays(first, -1), until: today }),
        fields: 'campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions,action_values', limit: 500, access_token: TOKEN,
      });
      data = await get(`https://graph.facebook.com/${V}/${acct}/insights?${qs}`);
    } catch (e) {
      console.log(acct, 'skipped:', e.message);
      continue;
    }
    for (const r of data) {
      const hour = Number(String(r.hourly_stats_aggregated_by_advertiser_time_zone).slice(0, 2));
      const day = ymd(wallToUtc(r.date_start, hour, acctTz), TZ);
      if (day < first || day > last) continue;
      const k = `${r.campaign_id}|${day}`;
      names.set(String(r.campaign_id), { id: String(r.campaign_id), name: r.campaign_name, account_id: acct });
      const x = rows.get(k) || { campaign_id: String(r.campaign_id), date: day, date_preset: `day:${day}`, account_id: acct, spend: 0, impressions: 0, clicks: 0, purchases_total: 0, purchase_value_total: 0, fetched_at: new Date().toISOString() };
      x.spend += Number(r.spend || 0);
      x.impressions += Number(r.impressions || 0);
      x.clicks += Number(r.inline_link_clicks || 0);
      x.purchases_total += act(r.actions, ['omni_purchase']);
      x.purchase_value_total += act(r.action_values, ['omni_purchase']);
      rows.set(k, x);
    }
    console.log(acct, 'tz', acctTz, 'hourly rows', data.length);
  }
  const list = [...rows.values()].map(x => ({ ...x, spend: +x.spend.toFixed(2), purchase_value_total: +x.purchase_value_total.toFixed(2) }));
  const byDay = {};
  list.forEach(x => { byDay[x.date] = (byDay[x.date] || 0) + x.spend; });
  console.log('days', first, '→', last, 'rows', list.length);
  console.log(Object.entries(byDay).sort().map(([d, v]) => `${d.slice(5)} $${v.toFixed(0)}`).join('  '));
  if (DRY) return console.log('dry run: nothing written');
  // ad_spend.campaign_id references ad_campaigns: register any campaign the sync has not seen (keeps existing rows as they are).
  const { data: known } = await sb.from('ad_campaigns').select('id');
  const have = new Set((known || []).map(c => String(c.id)));
  const missing = [...names.values()].filter(c => !have.has(c.id));
  if (missing.length) {
    const { error } = await sb.from('ad_campaigns').insert(missing);
    if (error) throw new Error('ad_campaigns: ' + error.message);
    console.log('registered campaigns', missing.map(c => c.name).join(', '));
  }
  for (let i = 0; i < list.length; i += 500) {
    const { error } = await sb.from('ad_spend').upsert(list.slice(i, i + 500), { onConflict: 'campaign_id,date_preset' });
    if (error) throw new Error(error.message);
  }
  console.log('upserted', list.length);
})().catch(e => { console.error(e.message); process.exit(1); });
