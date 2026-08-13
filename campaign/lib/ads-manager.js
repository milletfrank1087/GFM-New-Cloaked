const { supabase } = require('./db/client');

const ADS_MANAGER_URL = process.env.ADS_MANAGER_URL || 'https://fb-ads-manager.up.railway.app';
const SYNC_PRESETS = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_28d', 'last_30d', 'last_90d'];
const PREFERRED_PRESET = 'last_7d';
const DEFAULT_FETCH_TIMEOUT = 20000;

function normalizeCampaign(c) {
  return {
    id: String(c.id || ''),
    name: String(c.name || ''),
    account_id: String(c.account_id || ''),
    status: c.status || null,
    effective_status: c.effective_status || null,
    objective: c.objective || null,
    start_time: c.start_time || null,
    stop_time: c.stop_time || null,
    created_time: c.created_time || null,
    updated_time: c.updated_time || null,
  };
}

function normalizeSpendRow(campaignId, accountId, preset, row) {
  const date = row.date || null;
  return {
    campaign_id: campaignId,
    account_id: accountId,
    date_preset: preset,
    date,
    spend: Number(row.spend || 0),
    reach: Number(row.reach || 0),
    impressions: Number(row.impressions || 0),
    purchases_total: Number(row.purchases_total || 0),
    purchase_value_total: Number(row.purchase_value_total || 0),
    purchase_roas_total: Number(row.purchase_roas_total || 0) || null,
    cost_per_purchase: Number(row.cost_per_purchase || 0) || null,
    cpc: Number(row.cpc || row.cost_per_inline_link_click || 0) || null,
    cpm: Number(row.cpm || 0) || null,
    clicks: Number(row.link_clicks || row.inline_link_clicks || 0),
    fetched_at: new Date().toISOString(),
  };
}

async function fetchFromManager(path, params = {}) {
  const url = new URL(path, ADS_MANAGER_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`fb-ads-manager ${res.status}: ${body.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function postToManager(path, body = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(new URL(path, ADS_MANAGER_URL).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`fb-ads-manager ${res.status}: ${text.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshPreset(preset) {
  const result = await postToManager('/api/refresh', {
    date_preset: preset,
    level: 'campaign',
    only_had_delivery: false,
  });
  if (!result.ok) throw new Error(`refresh ${preset} failed: ${result.error || result.message || 'unknown'}`);
  return result;
}

async function syncCampaigns() {
  const data = await fetchFromManager('/api/dashboard', { date_preset: PREFERRED_PRESET, level: 'campaign' });
  if (!data || !data.campaigns || !Array.isArray(data.campaigns)) {
    throw new Error('no campaigns in fb-ads-manager response');
  }
  const accountId = data.account?.id || null;
  const rows = data.campaigns.map(normalizeCampaign);
  if (!rows.length) return { ok: true, synced: 0, accountId };

  const { error } = await supabase
    .from('ad_campaigns')
    .upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`campaign upsert failed: ${error.message}`);
  return { ok: true, synced: rows.length, accountId };
}

async function syncSpend() {
  const out = { campaigns: 0, spendRows: 0, presets: [], refreshed: [] };
  const { data: campaigns, error: campErr } = await supabase
    .from('ad_campaigns')
    .select('id, account_id, name')
    .order('name');
  if (campErr) throw new Error(`campaign fetch failed: ${campErr.message}`);

  for (const preset of SYNC_PRESETS) {
    let data = await fetchFromManager('/api/dashboard', { date_preset: preset, level: 'campaign' });
    if (!data || !data.rows || !Array.isArray(data.rows)) continue;

    const accountSpend = data.totals?.spend || 0;
    if (!accountSpend) {
      try {
        console.log(`[ads-sync] preset ${preset} empty, refreshing via fb-ads-manager`);
        await refreshPreset(preset);
        out.refreshed.push(preset);
        data = await fetchFromManager('/api/dashboard', { date_preset: preset, level: 'campaign' });
      } catch (err) {
        console.warn(`[ads-sync] refresh ${preset} failed:`, err.message);
        continue;
      }
    }

    const byId = new Map(campaigns.map(c => [c.id, c]));
    const rows = [];
    for (const r of data.rows || []) {
      const id = String(r.id || r.campaign_id || '');
      const campaign = byId.get(id) || campaigns.find(c => c.id === id);
      if (!campaign) continue;
      rows.push(normalizeSpendRow(campaign.id, campaign.account_id, preset, r));
    }
    if (!rows.length) continue;
    const { error } = await supabase
      .from('ad_spend')
      .upsert(rows, { onConflict: 'campaign_id,date_preset' });
    if (error) {
      console.warn(`[ads-sync] preset ${preset} upsert failed:`, error.message);
      continue;
    }
    out.spendRows += rows.length;
    out.presets.push(preset);
  }

  out.campaigns = campaigns.length;
  return { ok: true, ...out };
}

async function syncPreset(preset, { refresh = true } = {}) {
  const { data: campaigns, error: campErr } = await supabase
    .from('ad_campaigns')
    .select('id, account_id, name')
    .order('name');
  if (campErr) throw new Error(`campaign fetch failed: ${campErr.message}`);

  if (refresh) await refreshPreset(preset);
  const data = await fetchFromManager('/api/dashboard', { date_preset: preset, level: 'campaign' });
  if (!data || !Array.isArray(data.rows)) throw new Error(`no rows for preset ${preset}`);

  const byId = new Map(campaigns.map(c => [c.id, c]));
  const rows = [];
  for (const r of data.rows) {
    const id = String(r.id || r.campaign_id || '');
    const campaign = byId.get(id);
    if (campaign) rows.push(normalizeSpendRow(campaign.id, campaign.account_id, preset, r));
  }
  if (!rows.length) throw new Error(`no matching campaigns for preset ${preset}`);

  const { error } = await supabase
    .from('ad_spend')
    .upsert(rows, { onConflict: 'campaign_id,date_preset' });
  if (error) throw new Error(`preset ${preset} upsert failed: ${error.message}`);
  return { ok: true, preset, rows: rows.length, fetchedAt: new Date().toISOString() };
}

async function syncAll() {
  const campaigns = await syncCampaigns();
  const spend = await syncSpend();
  return { ok: true, campaigns, spend, at: new Date().toISOString() };
}

module.exports = { syncAll, syncCampaigns, syncSpend, syncPreset, SYNC_PRESETS, PREFERRED_PRESET };
