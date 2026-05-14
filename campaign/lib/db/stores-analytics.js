const { supabase } = require('./client');

async function getStoreStats() {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase.rpc('get_store_analytics');

    if (error) {
      console.error('Store analytics error:', error);
      return [];
    }
    return (data || []).map(s => ({
      id: s.store_id,
      slug: s.slug,
      domain: s.domain,
      name: s.name,
      status: s.status,
      paymentProcessor: s.payment_processor,
      weightPct: s.weight_pct || 0,
      totalProcessed: parseFloat(s.total_processed || 0),
      transactionCount: s.transaction_count || 0,
      maxMonthlyVolume: parseFloat(s.max_monthly_volume || 0),
      lastUsedAt: s.last_used_at,
      createdAt: s.created_at,
      monthVolume: parseFloat(s.month_volume || 0),
      monthTxnCount: parseInt(s.month_txn_count || 0),
      monthGross: parseFloat(s.month_gross || 0),
      monthFees: parseFloat(s.month_fees || 0),
      monthNet: parseFloat(s.month_net || 0),
      volumePct: parseFloat(s.volume_pct || 0),
      lastPaymentAt: s.last_payment_at
    }));
  } catch (err) {
    console.error('Store stats exception:', err);
    return [];
  }
}

async function getStoreDetail(storeId) {
  if (!supabase) return null;

  try {
    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .single();

    if (storeErr || !store) return null;

    const { data: payments } = await supabase
      .from('payments')
      .select('id, amount, service_fee, total_amount, stripe_fee, net_amount, currency, payment_source, status, customer_email, card_brand, card_last_digits, payment_method, created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: sessions } = await supabase
      .from('checkout_sessions')
      .select('id, amount, currency, source_ref, claimed, created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(20);

    const { data: failures } = await supabase
      .from('payment_failures')
      .select('id, error_type, error_code, error_message, request_amount, created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(20);

    const completedPayments = (payments || []).filter(p => p.status === 'completed');
    const totalGross = completedPayments.reduce((s, p) => s + parseFloat(p.total_amount || 0), 0);
    const totalFees = completedPayments.reduce((s, p) => s + parseFloat(p.stripe_fee || 0), 0);
    const totalNet = completedPayments.reduce((s, p) => s + parseFloat(p.net_amount || 0), 0);

    return {
      id: store.id,
      slug: store.slug,
      domain: store.domain,
      name: store.name,
      status: store.status,
      paymentProcessor: store.payment_processor,
      weightPct: store.weight_pct || 0,
      totalProcessed: parseFloat(store.total_processed || 0),
      transactionCount: store.transaction_count || 0,
      maxMonthlyVolume: parseFloat(store.max_monthly_volume || 0),
      lastUsedAt: store.last_used_at,
      createdAt: store.created_at,
      stats: {
        totalGross,
        totalFees,
        totalNet,
        paymentCount: completedPayments.length,
        avgTransaction: completedPayments.length > 0 ? totalGross / completedPayments.length : 0,
        failureCount: (failures || []).length
      },
      payments: (payments || []).map(p => ({
        id: p.id,
        amount: parseFloat(p.amount || 0),
        tip: parseFloat(p.service_fee || 0),
        total: parseFloat(p.total_amount || 0),
        fee: parseFloat(p.stripe_fee || 0),
        net: parseFloat(p.net_amount || 0),
        currency: p.currency,
        source: p.payment_source,
        status: p.status,
        email: p.customer_email,
        cardBrand: p.card_brand,
        cardLast4: p.card_last_digits,
        processor: p.payment_method,
        createdAt: p.created_at
      })),
      recentSessions: (sessions || []).map(s => ({
        id: s.id,
        amount: parseFloat(s.amount || 0),
        currency: s.currency,
        campaign: s.source_ref,
        claimed: s.claimed,
        createdAt: s.created_at
      })),
      recentFailures: (failures || []).map(f => ({
        id: f.id,
        errorType: f.error_type,
        errorCode: f.error_code,
        errorMessage: f.error_message,
        amount: parseFloat(f.request_amount || 0),
        createdAt: f.created_at
      }))
    };
  } catch (err) {
    console.error('Store detail exception:', err);
    return null;
  }
}

module.exports = { getStoreStats, getStoreDetail };
