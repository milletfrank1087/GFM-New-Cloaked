const { supabase } = require('./client');
const { getRandomGradient } = require('./helpers');

async function getAllCustomers() {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return [];

    const customerIds = data.map(c => c.id);
    const { data: latestPayments } = await supabase
      .from('payments')
      .select('customer_id, payment_source, card_brand, card_last_digits, store_domain')
      .in('customer_id', customerIds)
      .order('created_at', { ascending: false });

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
        totalAmount: parseFloat(c.total_donated),
        donationCount: c.donation_count,
        firstDonation: c.first_donation_at,
        lastDonation: c.last_donation_at,
        country: c.country,
        status: c.status || 'active',
        color: getRandomGradient(),
        paymentSource: latestPayment.payment_source || null,
        cardBrand: latestPayment.card_brand || null,
        storeDomain: latestPayment.store_domain || null
      };
    });
  } catch (err) {
    console.error('Get customers exception:', err);
    return [];
  }
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
    return data;
  } catch (err) {
    console.error('Get customer details exception:', err);
    return null;
  }
}

async function deleteCustomer(customerId) {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    await supabase.rpc('delete_customer_cascade', { p_customer_id: customerId });
    return { success: true };
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
