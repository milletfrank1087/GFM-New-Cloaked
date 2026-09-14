const { supabase } = require('./client');

function isTransientDbError(err) {
  const msg = (err && (err.message || err.code || err.error_description || String(err))) || '';
  return /gateway timeout|bad gateway|failed to get project config|timeout|fetch failed|503|502|504|520|23505|duplicate/i.test(msg);
}

function isUniqueViolation(err) {
  const code = err && err.code;
  const msg = (err && (err.message || String(err))) || '';
  return code === '23505' || /duplicate key|unique constraint/i.test(msg);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchExistingToken(token) {
  const { data, error } = await supabase
    .from('checkout_sessions')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function createDonationToken(tokenData) {
  if (!supabase) return null;

  const payload = {
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
  };

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data, error } = await supabase
        .from('checkout_sessions')
        .insert(payload)
        .select()
        .single();

      if (!error) return data;
      lastError = error;
      if (isUniqueViolation(error)) {
        const existing = await fetchExistingToken(payload.token);
        if (existing) return existing;
      }
      if (!isTransientDbError(error) || attempt === 3) break;
      await sleep(800 * attempt);
    } catch (err) {
      lastError = err;
      if (isUniqueViolation(err)) {
        const existing = await fetchExistingToken(payload.token);
        if (existing) return existing;
      }
      if (!isTransientDbError(err) || attempt === 3) break;
      await sleep(800 * attempt);
    }
  }

  console.error('Token creation error:', lastError);
  return null;
}

module.exports = { createDonationToken };
