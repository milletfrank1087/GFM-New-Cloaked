const { supabase, fetchRates, convertToBase } = require('./client');
const { formatTimeAgo, getInitials, getRandomGradient } = require('./helpers');

async function getRecentRealDonations(campaignSlug, limit = 20) {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('payments')
      .select('id, customer_name, amount, currency, stripe_charge_id, created_at')
      .eq('source_ref', campaignSlug)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];

    return data.map(d => ({
      name: d.customer_name,
      amount: parseFloat(d.amount),
      time: formatTimeAgo(d.created_at),
      initials: getInitials(d.customer_name),
      color: getRandomGradient(),
      message: '',
      transactionId: d.stripe_charge_id,
      timestamp: new Date(d.created_at).getTime(),
      isReal: true
    }));
  } catch (err) {
    console.error('Get donations exception:', err);
    return [];
  }
}

async function getCampaignRealStats(campaignSlug) {
  if (!supabase) return { realRaised: 0, realDonorCount: 0 };

  try {
    const { data, error } = await supabase
      .from('payments')
      .select('amount, customer_id, currency')
      .eq('source_ref', campaignSlug)
      .eq('status', 'completed');

    if (error) return { realRaised: 0, realDonorCount: 0 };

    const rates = await fetchRates();
    const realRaised = data.reduce((sum, p) => {
      return sum + convertToBase(parseFloat(p.amount), p.currency || 'EUR', rates);
    }, 0);
    const uniqueCustomers = new Set(data.map(p => p.customer_id).filter(Boolean)).size;

    return {
      realRaised,
      realDonorCount: uniqueCustomers || data.length
    };
  } catch (err) {
    console.error('Get stats exception:', err);
    return { realRaised: 0, realDonorCount: 0 };
  }
}

module.exports = { getRecentRealDonations, getCampaignRealStats };
