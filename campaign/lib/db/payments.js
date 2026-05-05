const { supabase } = require('./client');
const { getInitials, formatTimeAgo, getRandomGradient } = require('./helpers');

const PAYMENT_LIST_LIMIT = 1000;

function transformPaymentRow(p) {
  return {
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
    paypalFee: parseFloat(p.stripe_fee || 0),
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
  };
}

function buildPaymentDetail(p) {
  if (!p) return null;
  const customer = p.customers || {};
  const stripeRes = p.stripe_response || {};
  return {
    id: p.id,
    orderId: p.stripe_payment_intent_id || stripeRes.paymentIntentId || stripeRes.paypalOrderId || null,
    captureId: p.stripe_charge_id || stripeRes.chargeId || stripeRes.captureId || null,
    status: p.status,
    campaign: p.source_ref,
    storeDomain: p.store_domain,
    donor: {
      name: p.billing_name || p.customer_name,
      displayName: p.customer_name,
      isAnonymous: !!p.guest_checkout,
      initials: getInitials(p.billing_name || p.customer_name)
    },
    payer: {
      email: p.customer_email || customer.email || null,
      id: p.customer_id || null,
      country: customer.country || null
    },
    amounts: {
      donation: parseFloat(p.amount || 0),
      tip: parseFloat(p.service_fee || 0),
      total: parseFloat(p.total_amount || 0),
      paypalFee: parseFloat(p.stripe_fee || 0),
      stripeFee: parseFloat(p.stripe_fee || 0),
      net: parseFloat(p.net_amount || p.total_amount || 0),
      currency: p.currency || 'EUR'
    },
    card: {
      holderName: p.card_holder_name,
      lastDigits: p.card_last_digits,
      brand: p.card_brand,
      expiry: p.card_expiry,
      type: p.card_type,
      network: stripeRes.network || null
    },
    processing: {
      method: p.payment_method || 'stripe',
      source: p.payment_source || null,
      processorCode: stripeRes.status || null,
      walletType: stripeRes.walletType || null,
      vaultId: stripeRes.vaultId || null
    },
    metadata: {
      donationType: 'one-time',
      ipAddress: p.ip_address,
      userAgent: p.user_agent,
      utmSource: p.utm_source,
      utmMedium: p.utm_medium,
      utmCampaign: p.utm_campaign,
      utmContent: p.utm_content,
      utmTerm: p.utm_term,
      referrerUrl: p.referrer_url,
      landingUrl: p.landing_url,
      lineItems: p.line_items
    },
    timestamps: {
      created: p.created_at
    },
    raw: p
  };
}

async function getAllPayments(campaignSlug = null) {
  if (!supabase) return [];

  try {
    let query = supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAYMENT_LIST_LIMIT);

    if (campaignSlug) {
      query = query.eq('source_ref', campaignSlug);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[payments] list error:', error.message);
      return [];
    }

    return data.map(transformPaymentRow);
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

    if (error) {
      console.error('[payments] details error:', error.message);
      return null;
    }
    return buildPaymentDetail(data);
  } catch (err) {
    console.error('Get payment details exception:', err);
    return null;
  }
}

async function getRecentFailures(limit = 50) {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('payment_failures')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[payments] failures error:', error.message);
      return [];
    }
    return data;
  } catch (err) {
    console.error('Get failures exception:', err);
    return [];
  }
}

module.exports = { getAllPayments, getPaymentDetails, getRecentFailures, transformPaymentRow };
