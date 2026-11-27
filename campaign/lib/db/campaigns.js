const { supabase, fetchRates, convertCurrency, BASE_CURRENCY } = require('./client');
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

// PostgREST truncates a response at 1000 rows regardless of `.limit()` (max-rows),
// so a bare `.limit(5000)` silently stops at 1000 and understates long-running
// campaigns. Page explicitly instead. grace has ~1.9k rows and counting.
const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;

async function getCampaignRealStats(campaignSlug) {
  if (!supabase) return { realRaised: 0, realDonorCount: 0 };

  try {
    const data = [];
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
      const { data: page, error } = await supabase
        .from('payments')
        .select('amount, customer_id, currency')
        .eq('source_ref', campaignSlug)
        .eq('status', 'completed')
        .order('created_at', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) return { realRaised: 0, realDonorCount: 0 };
      if (!page || page.length === 0) break;
      data.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    if (data.length === 0) return { realRaised: 0, realDonorCount: 0 };

    const rates = await fetchRates();
    const targetCurrency = process.env.CURRENCY || BASE_CURRENCY;
    const realRaised = data.reduce((sum, p) => {
      return sum + convertCurrency(parseFloat(p.amount), p.currency || 'EUR', targetCurrency, rates);
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
