const { supabase } = require('./client');

function logFunnelEvent({ campaignSlug, eventType, visitor, amount, currency, cadence, storeDomain, eventId, capiStatus, sourceUrl, deviceType, extra }) {
  if (!supabase) return;

  const row = {
    campaign_slug: campaignSlug || process.env.ACTIVE_CAMPAIGN || 'unknown',
    event_type: eventType,
    visitor_id: visitor?.id || null,
    ip_address: visitor?.ip || null,
    city: visitor?.city || null,
    country: visitor?.country || null,
    amount: amount != null ? Number(amount) : null,
    currency: currency || null,
    cadence: cadence || null,
    store_domain: storeDomain || null,
    event_id: eventId || null,
    capi_meta: capiStatus?.meta || null,
    capi_tiktok: capiStatus?.tiktok || null,
    source_url: sourceUrl || null,
    device_type: deviceType || null,
    extra: extra || null
  };

  // supabase-js resolves with { error } on DB errors (it only rejects on network failures): check both.
  supabase.from('funnel_events').insert(row).then(({ error }) => {
    if (error) console.error(`[funnel] Insert error (${eventType}):`, error.message);
  }, (err) => {
    console.error(`[funnel] Insert error (${eventType}):`, err?.message);
  });
}

module.exports = { logFunnelEvent };
