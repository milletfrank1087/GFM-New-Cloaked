const BASE_CURRENCY = 'EUR';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const API_URL = 'https://api.frankfurter.app/latest';

let ratesCache = null;
let cacheTimestamp = 0;
let fetchPromise = null;

async function fetchRates() {
  if (ratesCache && (Date.now() - cacheTimestamp < CACHE_TTL_MS)) {
    return ratesCache;
  }

  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_URL}?from=${BASE_CURRENCY}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Exchange rate API returned ${res.status}`);
      const data = await res.json();

      const rates = { [BASE_CURRENCY]: 1 };
      for (const [code, rate] of Object.entries(data.rates)) {
        rates[code] = rate;
      }

      ratesCache = rates;
      cacheTimestamp = Date.now();
      return rates;
    } catch (err) {
      console.error('❌ Exchange rate fetch failed:', err.message);
      if (ratesCache) {
        console.warn('⚠️ Using stale exchange rates');
        return ratesCache;
      }
      return getFallbackRates();
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

function warmCache() {
  fetchRates().then(() => console.log('✅ Exchange rates pre-warmed')).catch(() => {});
}

warmCache();

function getFallbackRates() {
  console.warn('⚠️ Using hardcoded fallback exchange rates');
  return {
    EUR: 1,
    USD: 1.08,
    PLN: 4.32,
    GBP: 0.86,
    CZK: 25.2,
    BRL: 5.35,
    SEK: 11.2,
    NOK: 11.5,
    DKK: 7.46,
    CHF: 0.96,
    RON: 4.97,
    HUF: 395,
    BGN: 1.96,
    HRK: 7.53,
    TRY: 35.0,
    AUD: 1.65,
    CAD: 1.47,
    NZD: 1.78,
    JPY: 162,
    INR: 90.5,
    MXN: 18.5,
    COP: 4250,
  };
}

function convertToBase(amount, fromCurrency, rates) {
  if (!fromCurrency || fromCurrency === BASE_CURRENCY) return amount;
  const rate = rates[fromCurrency];
  if (!rate) {
    console.warn(`⚠️ No exchange rate for ${fromCurrency}, treating as ${BASE_CURRENCY}`);
    return amount;
  }
  return amount / rate;
}

module.exports = {
  fetchRates,
  convertToBase,
  warmCache,
  BASE_CURRENCY,
};
