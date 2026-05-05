const { supabase } = require('./client');
const { getRandomGradient } = require('./helpers');

const CUSTOMER_LIST_LIMIT = 1000;

async function getAllCustomers() {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(CUSTOMER_LIST_LIMIT);

    if (error) {
      console.error('[customers] list error:', error.message);
      return [];
    }
    if (!data || data.length === 0) return [];

    const customerIds = data.map(c => c.id);
    const { data: latestPayments, error: payErr } = await supabase
      .from('payments')
      .select('customer_id, payment_source, card_brand, card_last_digits, store_domain, payment_method, created_at')
      .in('customer_id', customerIds)
      .order('created_at', { ascending: false });

    if (payErr) {
      console.error('[customers] latest payment fetch error:', payErr.message);
    }

    const paymentMap = {};
    for (const p of (latestPayments || [])) {
      if (!paymentMap[p.customer_id]) {
        paymentMap[p.customer_id] = p;
      }
    }

    return data.map(c => {
      const latestPayment = paymentMap[c.id] || {};
      return {
        id: c.id,
        name: c.name,
        initials: c.initials || '?',
        email: c.email,
        cardHolderName: c.card_holder_name,
        totalAmount: parseFloat(c.total_donated || 0),
        donationCount: parseInt(c.donation_count || 0, 10),
        firstDonation: c.first_donation_at,
        lastDonation: c.last_donation_at,
        country: c.country,
        status: c.status || 'active',
        color: c.color_gradient || getRandomGradient(),
        paymentSource: latestPayment.payment_source || null,
        cardBrand: latestPayment.card_brand || null,
        cardLastDigits: latestPayment.card_last_digits || null,
        paymentMethod: latestPayment.payment_method || null,
        storeDomain: latestPayment.store_domain || null
      };
    });
  } catch (err) {
    console.error('Get customers exception:', err);
    return [];
  }
}

function getInitialsFromName(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function flattenCustomerDetails(rpcResult) {
  if (!rpcResult) return null;
  const c = rpcResult.customer || {};
  const rawPayments = rpcResult.payments || [];

  const totalDonated = parseFloat(c.total_donated || 0);
  const donationCount = parseInt(c.donation_count || rawPayments.length || 0, 10);
  const firstDonation = c.first_donation_at ||
    (rawPayments.length ? rawPayments[rawPayments.length - 1]?.created_at : null);
  const lastDonation = c.last_donation_at ||
    (rawPayments.length ? rawPayments[0]?.created_at : null);

  const payments = rawPayments.map(p => ({
    id: p.id,
    amount: parseFloat(p.amount || 0),
    tip: parseFloat(p.service_fee || 0),
    total: parseFloat(p.total_amount || 0),
    paypalFee: parseFloat(p.stripe_fee || 0),
    net: parseFloat(p.net_amount || p.total_amount || 0),
    currency: p.currency || 'EUR',
    status: p.status,
    cardBrand: p.card_brand,
    cardLastDigits: p.card_last_digits,
    cardHolderName: p.card_holder_name,
    paymentSource: p.payment_source,
    paymentMethod: p.payment_method,
    storeDomain: p.store_domain,
    campaign: p.source_ref,
    createdAt: p.created_at,
    vaultId: p.stripe_response?.vaultId || null
  }));

  return {
    id: c.id,
    name: c.name || 'Anonymous',
    initials: c.initials || getInitialsFromName(c.name),
    email: c.email,
    cardHolderName: c.card_holder_name,
    country: c.country,
    status: c.status || 'active',
    notes: c.notes,
    pausedAt: c.paused_at || null,
    payerEmail: c.email,
    payerId: c.id,
    vaultId: payments.find(p => p.vaultId)?.vaultId || null,
    stats: {
      totalDonated,
      donationCount,
      firstDonation,
      lastDonation,
      avgDonation: donationCount > 0 ? totalDonated / donationCount : 0
    },
    payments
  };
}

async function getCustomerDetails(customerId) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .rpc('get_customer_details_rpc', { p_customer_id: customerId });

    if (error) {
      console.error('Get customer details error:', error);
      return null;
    }
    return flattenCustomerDetails(data);
  } catch (err) {
    console.error('Get customer details exception:', err);
    return null;
  }
}

async function deleteCustomer(customerId) {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name')
      .eq('id', customerId)
      .maybeSingle();

    const { count: paymentCount } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId);

    const { error } = await supabase
      .rpc('delete_customer_cascade', { p_customer_id: customerId });

    if (error) {
      console.error('[customers] delete error:', error.message);
      return { success: false, error: error.message };
    }
    return {
      success: true,
      deletedCustomer: customer || { id: customerId, name: 'Customer' },
      deletedPayments: paymentCount || 0
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function toggleCustomerStatus(customerId, status) {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    const { error } = await supabase
      .from('customers')
      .update({ status })
      .eq('id', customerId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function updateCustomerNotes(customerId, notes) {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    const { error } = await supabase
      .from('customers')
      .update({ notes })
      .eq('id', customerId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  getAllCustomers,
  getCustomerDetails,
  deleteCustomer,
  toggleCustomerStatus,
  updateCustomerNotes
};
