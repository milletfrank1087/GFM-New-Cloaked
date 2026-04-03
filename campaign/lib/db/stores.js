const { supabase } = require('./client');

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

module.exports = { getNextStore, getStoreStats, toggleStoreStatus };
