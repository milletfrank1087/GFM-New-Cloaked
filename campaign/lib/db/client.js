const { createClient } = require('@supabase/supabase-js');
const { fetchRates, convertToBase, BASE_CURRENCY } = require('../exchangeRate');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase credentials not configured. Database features disabled.');
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

module.exports = { supabase, fetchRates, convertToBase, BASE_CURRENCY };
