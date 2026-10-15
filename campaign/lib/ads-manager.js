const { supabase } = require('./db/client');

const ADS_MANAGER_URL = process.env.ADS_MANAGER_URL || 'https://fb-ads-manager.up.railway.app';
const ADDITIONAL_AD_ACCOUNTS = (process.env.ADDITIONAL_AD_ACCOUNT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const SYNC_PRESETS = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_28d', 'last_30d', 'last_90d'];
const PREFERRED_PRESET = 'last_7d';
const DEFAULT_FETCH_TIMEOUT = 25000;

/* Tiered Volatility TTLs: Mutable intraday synced more frequently, historical less frequently */
const PRESET_TTLS = {
  today: 5 * 60 * 1000,         // 5 minutes (mutable intraday spend)
  yesterday: 20 * 60 * 1000,     // 20 minutes
  last_7d: 30 * 60 * 1000,       // 30 minutes (settling conversions)
  last_14d: 60 * 60 * 1000,      // 1 hour
  last_28d: 120 * 60 * 1000,     // 2 hours
  last_30d: 180 * 60 * 1000,     // 3 hours
  last_90d: 360 * 60 * 1000,     // 6 hours
};

const MIN_SYNC_INTERVAL_MS = 2 * 60 * 1000; // Hard minimum 2 minutes between calls per preset

/* In-flight Promise coalescing Map to prevent duplicate upstream requests */
const inFlightSyncs = new Map();
const lastSyncCompleted = new Map();
let consecutiveErrors = 0;
let circuitBreakerUntil = 0;
let backgroundWorkerTimer = null;

function extractNumeric(val) {
  if (val == null) return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0];
    if (typeof first === 'object' && first !== null) {
      return extractNumeric(first.value || first.amount || first.count || first.spend);
    }
    return extractNumeric(first);
  }
  if (typeof val === 'object') {
    return extractNumeric(val.value || val.amount || val.count || val.spend);
  }
  return 0;
}

function getPresetTtl(preset) {
  return PRESET_TTLS[preset] || (15 * 60 * 1000);
}

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
  const spend = extractNumeric(row.spend);
  const reach = extractNumeric(row.reach);
  const impressions = extractNumeric(row.impressions);
  const purchases_total = extractNumeric(row.purchases_total || row.purchases || row.actions);
  const purchase_value_total = extractNumeric(row.purchase_value_total || row.purchase_value || row.action_values);
  const purchase_roas_total = extractNumeric(row.purchase_roas_total || row.purchase_roas || row.roas) || (spend > 0 && purchase_value_total > 0 ? purchase_value_total / spend : null);
  const cost_per_purchase = extractNumeric(row.cost_per_purchase || row.cost_per_action_type || row.cpa) || (purchases_total > 0 ? spend / purchases_total : null);
  const clicks = extractNumeric(row.link_clicks || row.inline_link_clicks || row.clicks);

  const fetchedAtTimestamp = row.insights_fetched_at || row.last_synced_at || new Date().toISOString();

  return {
    campaign_id: String(campaignId),
    account_id: String(accountId || ''),
    date_preset: preset,
    date,
    spend,
    reach,
    impressions,
    purchases_total,
    purchase_value_total,
    purchase_roas_total,
    cost_per_purchase,
    cpc: extractNumeric(row.cpc || row.cost_per_inline_link_click) || null,
    cpm: extractNumeric(row.cpm) || null,
    clicks,
    fetched_at: fetchedAtTimestamp,
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

/* Serialized Refresh Mutex Queue to prevent proxy concurrency rejections */
let refreshChain = Promise.resolve();

async function refreshPreset(preset, { force = false } = {}) {
  const runRefresh = async () => {
    try {
      const body = { date_preset: preset, level: 'campaign', only_had_delivery: false, force: !!force };
      const result = await postToManager('/api/refresh', body);
      if (!result.ok) {
        console.warn(`[ads-sync] upstream refresh note for ${preset}:`, result.error || result.message || 'unknown');
      }
      return result;
    } catch (err) {
      console.warn(`[ads-sync] upstream refresh note for ${preset}:`, err.message);
      return { ok: false, error: err.message };
    }
  };

  if (force) {
    return runRefresh();
  }

  const nextTask = refreshChain.then(() => runRefresh());
  refreshChain = nextTask.catch(() => {});
  return nextTask;
}

async function syncCampaigns() {
  const allRows = [];

  const fetchAccount = async (accountId) => {
    const params = { date_preset: PREFERRED_PRESET, level: 'campaign' };
    if (accountId) params.account_id = accountId;
    const data = await fetchFromManager('/api/dashboard', params);
    if (data?.campaigns && Array.isArray(data.campaigns)) {
      allRows.push(...data.campaigns.map(normalizeCampaign));
    }
  };

  await fetchAccount(null);
  for (const acct of ADDITIONAL_AD_ACCOUNTS) {
    try { await fetchAccount(acct); } catch (err) {
      console.warn(`[ads-sync] campaign sync for ${acct}:`, err.message);
    }
  }

  if (!allRows.length) return { ok: true, synced: 0 };

  const { error } = await supabase
    .from('ad_campaigns')
    .upsert(allRows, { onConflict: 'id' });
  if (error) throw new Error(`campaign upsert failed: ${error.message}`);
  return { ok: true, synced: allRows.length };
}

async function syncPreset(preset, { force = false, refresh = true } = {}) {
  const now = Date.now();

  // Check circuit breaker
  if (now < circuitBreakerUntil && !force) {
    console.warn(`[ads-sync] Circuit breaker active until ${new Date(circuitBreakerUntil).toISOString()}. Skipping sync.`);
    return { ok: false, reason: 'circuit_breaker_active' };
  }

  // Check debounce / TTL unless forced
  const lastSync = lastSyncCompleted.get(preset) || 0;
  if (!force && (now - lastSync < MIN_SYNC_INTERVAL_MS)) {
    return { ok: true, cached: true, preset, note: 'within_debounce_window' };
  }

  // In-flight Promise coalescing
  if (inFlightSyncs.has(preset)) {
    return inFlightSyncs.get(preset);
  }

  const syncPromise = (async () => {
    try {
      let { data: campaigns, error: campErr } = await supabase
        .from('ad_campaigns')
        .select('id, account_id, name')
        .order('name');
      if (campErr) throw new Error(`campaign fetch failed: ${campErr.message}`);

      if (!campaigns || campaigns.length === 0) {
        await syncCampaigns();
        const refetch = await supabase.from('ad_campaigns').select('id, account_id, name').order('name');
        campaigns = refetch.data || [];
      }

      if (refresh) {
        try {
          await refreshPreset(preset, { force });
        } catch (err) {
          console.warn(`[ads-sync] refreshPreset ${preset} note:`, err.message);
        }
      }

      const allAccountIds = [null, ...ADDITIONAL_AD_ACCOUNTS];
      const allDataRows = [];
      const dashResults = await Promise.all(allAccountIds.map(async (acctId) => {
        try {
          const params = { date_preset: preset, level: 'campaign' };
          if (acctId) params.account_id = acctId;
          const data = await fetchFromManager('/api/dashboard', params);
          return { acctId, data };
        } catch (err) {
          console.warn(`[ads-sync] dashboard fetch for ${acctId || 'primary'} preset ${preset}:`, err.message);
          return null;
        }
      }));
      for (const item of dashResults) {
        if (item?.data?.rows && Array.isArray(item.data.rows)) {
          for (const r of item.data.rows) {
            r._source_account_id = item.acctId || item.data.account?.id || item.data.account_id || null;
          }
          allDataRows.push(...item.data.rows);
        }
      }
      if (!allDataRows.length) throw new Error(`no rows for preset ${preset}`);

      let byId = new Map(campaigns.map(c => [c.id, c]));

      // New campaigns: register them from THIS response (each row carries the campaign's id/name/status).
      // Relying on another preset's campaign list failed whenever that list was cached before the
      // campaign existed: ad_spend has a foreign key to ad_campaigns, so one unknown id rejected the
      // whole batch and tripped the circuit breaker.
      const unseen = new Map();
      for (const r of allDataRows) {
        const id = String(r.id || r.campaign_id || '');
        if (id && !byId.has(id) && !unseen.has(id)) {
          unseen.set(id, normalizeCampaign({ ...r, id, account_id: r.account_id || r._source_account_id || '' }));
        }
      }
      if (unseen.size) {
        const { error: seedErr } = await supabase.from('ad_campaigns').upsert([...unseen.values()], { onConflict: 'id' });
        if (seedErr) {
          console.warn('[ads-sync] new campaign registration failed:', seedErr.message);
        } else {
          for (const c of unseen.values()) byId.set(c.id, c);
          console.log(`[ads-sync] registered ${unseen.size} new campaign(s): ${[...unseen.values()].map(c => c.name).join(', ')}`);
        }
      }

      const rows = [];
      let skipped = 0;
      for (const r of allDataRows) {
        const id = String(r.id || r.campaign_id || '');
        const campaign = byId.get(id);
        if (campaign) {
          rows.push(normalizeSpendRow(campaign.id, campaign.account_id || r._source_account_id, preset, r));
        } else if (id) {
          skipped += 1; // registration failed: skip this campaign instead of failing everyone's spend
        }
      }
      if (skipped) console.warn(`[ads-sync] preset ${preset}: skipped ${skipped} row(s) for unregistered campaigns`);

      if (rows.length > 0) {
        const deduped = new Map();
        for (const r of rows) {
          const key = `${r.campaign_id}::${r.date_preset}`;
          const existing = deduped.get(key);
          if (!existing || (r.spend > existing.spend)) deduped.set(key, r);
        }
        const uniqueRows = [...deduped.values()];
        const { error } = await supabase
          .from('ad_spend')
          .upsert(uniqueRows, { onConflict: 'campaign_id,date_preset' });
        if (error) throw new Error(`preset ${preset} upsert failed: ${error.message}`);
      }

      lastSyncCompleted.set(preset, Date.now());
      consecutiveErrors = 0;
      return { ok: true, preset, rows: rows.length, fetchedAt: new Date().toISOString() };
    } catch (err) {
      consecutiveErrors += 1;
      if (consecutiveErrors >= 3) {
        circuitBreakerUntil = Date.now() + (10 * 60 * 1000); // 10m pause
        console.error(`[ads-sync] 3 consecutive errors. Activating circuit breaker for 10 minutes.`);
      }
      throw err;
    } finally {
      inFlightSyncs.delete(preset);
    }
  })();

  inFlightSyncs.set(preset, syncPromise);
  return syncPromise;
}

async function syncSpend() {
  const out = { campaigns: 0, spendRows: 0, presets: [] };
  for (const preset of ['today', 'yesterday', 'last_7d', 'last_30d', 'this_month', 'last_month', 'last_90d']) {
    try {
      const res = await syncPreset(preset, { force: true });
      if (res.rows) out.spendRows += res.rows;
      out.presets.push(preset);
    } catch (err) {
      console.warn(`[ads-sync] syncSpend preset ${preset} error:`, err.message);
    }
  }
  return { ok: true, ...out };
}

async function syncAll() {
  const campaigns = await syncCampaigns();
  const spend = await syncSpend();
  return { ok: true, campaigns, spend, at: new Date().toISOString() };
}

function shouldRunAdsSyncWorker() {
  const flag = String(process.env.ADS_SYNC_ENABLED || '').toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  if (flag === '1' || flag === 'true' || flag === 'on') return true;
  const service = String(process.env.RAILWAY_SERVICE_NAME || process.env.ZEABUR_SERVICE_NAME || '').toLowerCase();
  if (service) return /uk[-_\s]*campaign/.test(service);
  return process.env.ACTIVE_CAMPAIGN === 'dipg-willow' && process.env.CURRENCY === 'GBP';
}

/* Background Synchronizer Daemon */
function startBackgroundSyncWorker() {
  if (backgroundWorkerTimer) return;
  if (!shouldRunAdsSyncWorker()) {
    console.log('[ads-sync] Worker skipped on this service (UK Campaign is the leader; set ADS_SYNC_ENABLED=true to override).');
    return;
  }
  console.log('[ads-sync] Background sync worker started (auto-seeding all presets).');

  // Initial non-blocking staggered warmup
  setTimeout(async () => {
    try {
      console.log('[ads-sync] Warming up today & yesterday presets…');
      await syncPreset('today', { refresh: true });
      await syncPreset('yesterday', { refresh: false });
    } catch (err) {
      console.warn('[ads-sync] Initial warmup note (today/yesterday):', err.message);
    }
  }, 2000);

  setTimeout(async () => {
    try {
      console.log('[ads-sync] Warming up last_7d & last_30d presets…');
      await syncPreset('last_7d', { refresh: false });
      await syncPreset('last_30d', { refresh: false });
    } catch (err) {
      console.warn('[ads-sync] Initial warmup note (last_7d/last_30d):', err.message);
    }
  }, 5000);

  setTimeout(async () => {
    try {
      console.log('[ads-sync] Warming up last_90d preset…');
      await syncPreset('last_90d', { refresh: false });
    } catch (err) {
      console.warn('[ads-sync] Initial warmup note (last_90d):', err.message);
    }
  }, 8000);

  // Periodic interval (every 5 minutes)
  let ticks = 0;
  backgroundWorkerTimer = setInterval(async () => {
    ticks += 1;
    try {
      // Sync today every 5 minutes
      await syncPreset('today', { refresh: true });

      // Refresh campaigns list every hour (every 12 ticks)
      if (ticks % 12 === 0) {
        await syncCampaigns().catch(e => console.warn('[ads-sync] Campaign list refresh note:', e.message));
      }

      // Sync yesterday every 20 minutes (every 4 ticks)
      if (ticks % 4 === 0) {
        await syncPreset('yesterday', { refresh: true });
      }

      // Sync last_7d every 30 minutes (every 6 ticks)
      if (ticks % 6 === 0) {
        await syncPreset('last_7d', { refresh: true });
      }

      // Sync last_30d every 2 hours (every 24 ticks)
      if (ticks % 24 === 0) {
        await syncPreset('last_30d', { refresh: true });
      }
    } catch (err) {
      console.warn('[ads-sync] Periodic background sync note:', err.message);
    }
  }, 5 * 60 * 1000);
}

function stopBackgroundSyncWorker() {
  if (backgroundWorkerTimer) {
    clearInterval(backgroundWorkerTimer);
    backgroundWorkerTimer = null;
    console.log('[ads-sync] Background sync worker stopped.');
  }
}

module.exports = {
  syncAll,
  syncCampaigns,
  syncSpend,
  syncPreset,
  getPresetTtl,
  startBackgroundSyncWorker,
  stopBackgroundSyncWorker,
  SYNC_PRESETS,
  PREFERRED_PRESET,
  MIN_SYNC_INTERVAL_MS,
  extractNumeric,
};
