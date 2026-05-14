const { supabase } = require('./client');

const FALLBACK_STORE = {
  id: process.env.STORE_ID || 'digitelon',
  domain: process.env.STORE_DOMAIN || 'www.digitelon.shop',
  name: process.env.STORE_NAME || 'Digitelon',
  payment_processor: 'stripe',
  status: 'active'
};

async function getNextStore() {
  if (!supabase) return FALLBACK_STORE;

  try {
    const { data, error } = await supabase.rpc('get_next_store');

    if (error || !data?.[0]) {
      return FALLBACK_STORE;
    }

    return data[0];
  } catch (err) {
    console.error('Get next store exception:', err);
    return FALLBACK_STORE;
  }
}

async function createStore(storeData) {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const status = storeData.status === 'active' ? 'active' : 'paused';
  const weightPct = Number.isFinite(storeData.weightPct) ? Math.max(0, Math.min(100, parseInt(storeData.weightPct, 10))) : 0;

  try {
    const { data, error } = await supabase
      .from('stores')
      .insert({
        slug: storeData.slug,
        domain: storeData.domain,
        name: storeData.name,
        payment_processor: storeData.paymentProcessor || 'stripe',
        max_monthly_volume: storeData.maxMonthlyVolume || 100000,
        status,
        weight_pct: weightPct
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, store: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function updateStore(storeId, updates) {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    const allowed = {};
    if (updates.name !== undefined) allowed.name = updates.name;
    if (updates.domain !== undefined) allowed.domain = updates.domain;
    if (updates.maxMonthlyVolume !== undefined) allowed.max_monthly_volume = updates.maxMonthlyVolume;
    if (updates.status !== undefined) {
      if (!['active', 'paused'].includes(updates.status)) {
        return { success: false, error: 'status must be active or paused' };
      }
      allowed.status = updates.status;
    }
    if (updates.weightPct !== undefined) {
      const w = parseInt(updates.weightPct, 10);
      if (!Number.isFinite(w) || w < 0 || w > 100) {
        return { success: false, error: 'weightPct must be an integer between 0 and 100' };
      }
      allowed.weight_pct = w;
    }

    if (Object.keys(allowed).length === 0) return { success: false, error: 'No valid fields to update' };

    const { data, error } = await supabase
      .from('stores')
      .update(allowed)
      .eq('id', storeId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, store: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function toggleStoreStatus(storeId, status) {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  if (!['active', 'paused'].includes(status)) {
    return { success: false, error: 'status must be active or paused' };
  }

  try {
    const patch = { status };
    if (status === 'paused') patch.weight_pct = 0;

    const { error } = await supabase
      .from('stores')
      .update(patch)
      .eq('id', storeId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deleteStore(storeId) {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    const { data: store, error: fetchErr } = await supabase
      .from('stores')
      .select('id, slug, transaction_count')
      .eq('id', storeId)
      .single();

    if (fetchErr || !store) return { success: false, error: 'Store not found' };

    if (store.transaction_count > 0) {
      const { error } = await supabase
        .from('stores')
        .update({ status: 'paused', weight_pct: 0 })
        .eq('id', storeId);

      if (error) return { success: false, error: error.message };
      return { success: true, method: 'soft-delete' };
    }

    await supabase.from('payment_failures').delete().eq('store_id', storeId);
    await supabase.from('payments').delete().eq('store_id', storeId);
    await supabase.from('checkout_sessions').delete().eq('store_id', storeId);

    const { error } = await supabase
      .from('stores')
      .delete()
      .eq('id', storeId);

    if (error) return { success: false, error: error.message };
    return { success: true, method: 'hard-delete' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function rebalanceStores(updates) {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  if (!Array.isArray(updates) || updates.length === 0) {
    return { success: false, error: 'updates must be a non-empty array' };
  }

  const payload = updates.map(u => ({
    id: u.id,
    weight_pct: Number.isFinite(parseInt(u.weightPct, 10)) ? parseInt(u.weightPct, 10) : 0,
    status: u.status === 'active' ? 'active' : 'paused'
  }));

  if (payload.some(p => !p.id)) {
    return { success: false, error: 'every update entry must include a store id' };
  }

  try {
    const { data, error } = await supabase.rpc('rebalance_stores', { updates: payload });
    if (error) return { success: false, error: error.message };
    return { success: true, stores: data || [] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { getNextStore, createStore, updateStore, toggleStoreStatus, deleteStore, rebalanceStores };
