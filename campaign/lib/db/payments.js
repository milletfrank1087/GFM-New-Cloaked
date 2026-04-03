const { supabase } = require('./client');
const { getInitials, formatTimeAgo, getRandomGradient } = require('./helpers');

async function getAllPayments(campaignSlug = null) {
  if (!supabase) return [];

  try {
    let query = supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false });

    if (campaignSlug) {
      query = query.eq('source_ref', campaignSlug);
    }

    const { data, error } = await query;
    if (error) return [];

    return data.map(p => ({
      id: p.id,
      stripeChargeId: p.stripe_charge_id,
      stripePaymentIntentId: p.stripe_payment_intent_id,
      name: p.billing_name || p.customer_name,
      displayName: p.customer_name,
      initials: getInitials(p.billing_name || p.customer_name),
      email: p.customer_email,
      amount: parseFloat(p.amount),
      tipAmount: parseFloat(p.service_fee || 0),
      totalAmount: parseFloat(p.total_amount),
      stripeFee: parseFloat(p.stripe_fee || 0),
      netAmount: parseFloat(p.net_amount || p.total_amount),
      currency: p.currency || 'EUR',
      status: p.status,
      date: formatTimeAgo(p.created_at),
      rawDate: p.created_at,
      type: p.payment_source || 'card',
      donationType: 'one-time',
      campaign: p.source_ref,
      storeDomain: p.store_domain,
      color: getRandomGradient(),
      cardBrand: p.card_brand,
      cardLastDigits: p.card_last_digits,
      cardHolderName: p.card_holder_name,
      isAnonymous: p.guest_checkout,
      lineItems: p.line_items
    }));
  } catch (err) {
    console.error('Get payments exception:', err);
    return [];
  }
}

async function getPaymentDetails(paymentId) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*, customers(*)')
      .eq('id', paymentId)
      .single();

    if (error) return null;
    return data;
  } catch (err) {
    console.error('Get payment details exception:', err);
    return null;
  }
}

async function getRecentFailures(limit = 10) {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('payment_failures')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return data;
  } catch (err) {
    console.error('Get failures exception:', err);
    return [];
  }
}

module.exports = { getAllPayments, getPaymentDetails, getRecentFailures };
