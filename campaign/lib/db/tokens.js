const { supabase } = require('./client');

async function createDonationToken(tokenData) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('checkout_sessions')
      .insert({
        token: tokenData.token,
        amount: tokenData.amount,
        currency: tokenData.currency,
        source_ref: tokenData.campaignSlug,
        store_id: tokenData.storeId,
        language: tokenData.language,
        service_fee: tokenData.tipAmount || 0,
        guest_checkout: tokenData.isAnonymous || false,
        customer_email: tokenData.donorEmail || null,
        tracking: tokenData.tracking || {},
        ip_address: tokenData.ipAddress || null,
        user_agent: tokenData.userAgent || null,
        expires_at: tokenData.expiresAt
      })
      .select()
      .single();

    if (error) {
      console.error('Token creation error:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Token creation exception:', err);
    return null;
  }
}

module.exports = { createDonationToken };
