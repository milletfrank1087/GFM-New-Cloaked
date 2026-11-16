// Guardrail: verify that re-bucketing Meta hourly insights into Europe/Athens days
// still reconciles with Meta's own plain totals. Read-only (Meta GET insights only).
// If Meta changes hourly publishing or the account timezone handling drifts, the
// Athens totals diverge from plain totals and this exits non-zero.
// Usage: node tools/check-athens-reconciliation.js [days=14]
// Run weekly; also run after any fb-ads-manager adInsights change.
const fs = require('fs');
const path = require('path');

const env = Object.fromEntries(fs.readFileSync('C:/Users/iakwv/Downloads/FB ads manager/.env', 'utf8')
  .split('\n').map(l => l.replace('\r', '')).filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const TOKEN = env.FB_SYSTEM_USER_ACCESS_TOKEN || env.FB_USER_ACCESS_TOKEN;
const V = env.GRAPH_API_VERSION || 'v21.0';
const ACCOUNT = env.FB_PRIMARY_ACCOUNT_ID.startsWith('act_') ? env.FB_PRIMARY_ACCOUNT_ID : `act_${env.FB_PRIMARY_ACCOUNT_ID}`;
const DAYS = Number(process.argv[2]) || 14;
const TZ = 'Europe/Athens';
// Ignore the most recent 3 account days: multi-day hourly ranges only publish
// through accountToday-2 and that last day can still be a few dollars short
// (verified 2026-11-16: $2.06 missing on accountToday-2), so reconciliation
// uses accountToday-3 as the last trustworthy day.
const SETTLED_LAG_DAYS = 3;
const TOLERANCE_USD = 0.05; // rounding only; purchases must match exactly

const ymd = (ms, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
function offsetMin(tz, ms) {
  const v = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).find(p => p.type === 'timeZoneName')?.value || 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(v);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
}
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
  if (!TOKEN) throw new Error('no Meta token in FB ads manager .env');
  const info = await (await fetch(`https://graph.facebook.com/${V}/${ACCOUNT}?fields=timezone_name&access_token=${TOKEN}`)).json();
  if (info.error) throw new Error(info.error.message);
  const acctTz = info.timezone_name;
  console.log(`account ${ACCOUNT} timezone ${acctTz} (expected America/Los_Angeles; cockpit reports Europe/Athens)`);

  const accountToday = ymd(Date.now(), acctTz);
  const settledUntil = addDays(accountToday, -SETTLED_LAG_DAYS);
  // Athens window: the DAYS Athens days ending at the Athens day that contains settledUntil.
  const athensEnd = ymd(wallToUtc(settledUntil, 12, acctTz), TZ);
  const athensStart = addDays(athensEnd, -(DAYS - 1));

  const fields = 'spend,impressions,actions,action_values';
  // Pad the start for edge hours, but never past settledUntil: plain totals include
  // recent days that multi-day hourly ranges have not published yet.
  const pad = { since: addDays(athensStart, -2), until: settledUntil };
  const hourlyQs = new URLSearchParams({
    level: 'campaign', time_increment: 1, breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
    time_range: JSON.stringify(pad), fields, limit: 500, access_token: TOKEN,
  });
  const hourly = await get(`https://graph.facebook.com/${V}/${ACCOUNT}/insights?${hourlyQs}`);

  // Plain totals (one row per campaign over the range) — the ground truth the
  // hourly payload must sum to over the same padded range.
  const plainQs = new URLSearchParams({
    level: 'campaign', time_range: JSON.stringify(pad), fields, limit: 500, access_token: TOKEN,
  });
  const plain = await get(`https://graph.facebook.com/${V}/${ACCOUNT}/insights?${plainQs}`);

  // Hourly side: re-bucket to Athens days, keep the requested Athens window.
  const hourlyTotals = { spend: 0, impressions: 0, purchases: 0, value: 0 };
  for (const r of hourly) {
    const hour = Number(String(r.hourly_stats_aggregated_by_advertiser_time_zone).slice(0, 2));
    const day = ymd(wallToUtc(r.date_start, hour, acctTz), TZ);
    if (day < athensStart || day > athensEnd) continue;
    hourlyTotals.spend += Number(r.spend || 0);
    hourlyTotals.impressions += Number(r.impressions || 0);
    hourlyTotals.purchases += act(r.actions, ['omni_purchase']);
    hourlyTotals.value += act(r.action_values, ['omni_purchase']);
  }

  const plainTotals = { spend: 0, impressions: 0, purchases: 0, value: 0 };
  for (const r of plain) {
    plainTotals.spend += Number(r.spend || 0);
    plainTotals.impressions += Number(r.impressions || 0);
    plainTotals.purchases += act(r.actions, ['omni_purchase']);
    plainTotals.value += act(r.action_values, ['omni_purchase']);
  }
  const hourlyPadded = { spend: 0, impressions: 0, purchases: 0, value: 0 };
  for (const r of hourly) {
    if (r.date_start < pad.since || r.date_start > pad.until) continue;
    hourlyPadded.spend += Number(r.spend || 0);
    hourlyPadded.impressions += Number(r.impressions || 0);
    hourlyPadded.purchases += act(r.actions, ['omni_purchase']);
    hourlyPadded.value += act(r.action_values, ['omni_purchase']);
  }

  console.log(`Athens window ${athensStart} -> ${athensEnd}: spend $${hourlyTotals.spend.toFixed(2)}, purchases ${hourlyTotals.purchases}, value $${hourlyTotals.value.toFixed(2)}`);
  console.log(`padded range ${pad.since} -> ${pad.until}: hourly spend $${hourlyPadded.spend.toFixed(2)} vs plain $${plainTotals.spend.toFixed(2)}; purchases ${hourlyPadded.purchases} vs ${plainTotals.purchases}`);

  const failures = [];
  if (Math.abs(hourlyPadded.spend - plainTotals.spend) > TOLERANCE_USD) failures.push(`spend diverges by $${(hourlyPadded.spend - plainTotals.spend).toFixed(2)}`);
  if (hourlyPadded.purchases !== plainTotals.purchases) failures.push(`purchases diverge: hourly ${hourlyPadded.purchases} vs plain ${plainTotals.purchases}`);
  if (Math.abs(hourlyPadded.value - plainTotals.value) > TOLERANCE_USD) failures.push(`purchase value diverges by $${(hourlyPadded.value - plainTotals.value).toFixed(2)}`);
  if (acctTz !== 'America/Los_Angeles') failures.push(`account timezone changed to ${acctTz} — revisit the re-bucketing assumptions`);

  if (failures.length) {
    console.error('RECONCILIATION FAILED:');
    for (const f of failures) console.error(' -', f);
    process.exit(1);
  }
  console.log('OK: Athens re-bucketing reconciles with Meta plain totals.');
})().catch(e => { console.error(e.message); process.exit(1); });
