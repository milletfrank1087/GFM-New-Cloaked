const BASE_CURRENCY = 'EUR';
const API_BASE = 'https://api.frankfurter.app';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_CACHE_LIMIT = 500;

const ratesCache = new Map();
const ratesInFlight = new Map();
let latestCache = null;
let latestTs = 0;

const FALLBACK_RATES = {
  EUR: 1, USD: 1.08, PLN: 4.32, GBP: 0.86, CZK: 25.2, BRL: 5.35,
  SEK: 11.2, NOK: 11.5, DKK: 7.46, CHF: 0.96, RON: 4.97, HUF: 395,
  BGN: 1.96, HRK: 7.53, TRY: 35.0, AUD: 1.65, CAD: 1.47, NZD: 1.78,
  JPY: 162, INR: 90.5, MXN: 18.5, COP: 4250,
};

function amount(value, fallback = 0) {
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function fetchRateForDate(dateKey, codes) {
  if (!dateKey) return null;
  const nonBaseCodes = codes.filter(c => c && c !== BASE_CURRENCY);
  if (!nonBaseCodes.length) return { [BASE_CURRENCY]: 1 };

  const cached = ratesCache.get(dateKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.rates;
  if (ratesInFlight.has(dateKey)) return ratesInFlight.get(dateKey);

  const from = BASE_CURRENCY;
  const to = nonBaseCodes.join(',');
  const request = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${API_BASE}/${dateKey}?from=${from}&to=${to}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const data = await res.json();
      const rates = { [from]: 1, ...data.rates };
      ratesCache.set(dateKey, { rates, ts: Date.now() });
      if (ratesCache.size > RATE_CACHE_LIMIT) {
        const oldest = ratesCache.keys().next().value;
        ratesCache.delete(oldest);
      }
      return rates;
    } catch {
      return null;
    } finally {
      ratesInFlight.delete(dateKey);
    }
  })();
  ratesInFlight.set(dateKey, request);
  return request;
}

async function fetchLatestRates() {
  if (latestCache && Date.now() - latestTs < 60 * 60 * 1000) return latestCache;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API_BASE}/latest?from=${BASE_CURRENCY}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    latestCache = { [BASE_CURRENCY]: 1, ...data.rates };
    latestTs = Date.now();
    return latestCache;
  } catch {
    return latestCache || FALLBACK_RATES;
  }
}

function convertToBase(amountVal, fromCurrency, rates) {
  if (!fromCurrency || fromCurrency === BASE_CURRENCY) return amountVal;
  const rate = rates?.[fromCurrency] || FALLBACK_RATES[fromCurrency];
  if (!rate || rate <= 0) {
    return amountVal;
  }
  return amountVal / rate;
}

function computePaymentAmounts(p) {
  const donationNative = amount(p.amount);
  const tipNative = amount(p.service_fee);
  const grossNative = amount(p.total_amount) || (donationNative + tipNative);
  const feeNative = amount(p.stripe_fee);
  const netNative = p.net_amount != null ? amount(p.net_amount) : (grossNative - feeNative);
  return { donationNative, tipNative, grossNative, feeNative, netNative };
}

async function convertPaymentToBase(p, codes) {
  const dateKey = dayKey(p.created_at);
  if (!dateKey) return null;
  const cur = p.currency || BASE_CURRENCY;
  const rates = await fetchRateForDate(dateKey, codes || [cur]);
  const { donationNative, tipNative, grossNative, feeNative, netNative } = computePaymentAmounts(p);
  return {
    amountBase: convertToBase(donationNative, cur, rates),
    tipBase: convertToBase(tipNative, cur, rates),
    grossBase: convertToBase(grossNative, cur, rates),
    feeBase: convertToBase(feeNative, cur, rates),
    netBase: convertToBase(netNative, cur, rates),
  };
}

async function convertPaymentsToBase(payments) {
  const codes = [...new Set(payments.map(p => p.currency || BASE_CURRENCY))];
  const rateCache = new Map();
  const dateKeysNeedingRates = [...new Set(
    payments
      .filter(p => (p.currency || BASE_CURRENCY) !== BASE_CURRENCY)
      .map(p => dayKey(p.created_at))
      .filter(Boolean)
  )];

  if (dateKeysNeedingRates.length > 0) {
    let nextDateIndex = 0;
    async function worker() {
      while (nextDateIndex < dateKeysNeedingRates.length) {
        const dateKey = dateKeysNeedingRates[nextDateIndex++];
        rateCache.set(dateKey, await fetchRateForDate(dateKey, codes));
      }
    }
    await Promise.all(Array.from({ length: Math.min(8, dateKeysNeedingRates.length) }, worker));
  }

  const out = [];
  for (const p of payments) {
    const dateKey = dayKey(p.created_at);
    if (!dateKey) continue;
    const cur = p.currency || BASE_CURRENCY;
    const rates = cur === BASE_CURRENCY ? { [BASE_CURRENCY]: 1 } : rateCache.get(dateKey);
    const { donationNative, tipNative, grossNative, feeNative, netNative } = computePaymentAmounts(p);
    out.push({
      raw: p,
      date: dateKey,
      currency: cur,
      fx: {
        baseCurrency: BASE_CURRENCY,
        rateDate: dateKey,
        rate: cur === BASE_CURRENCY ? 1 : (rates?.[cur] || FALLBACK_RATES[cur] || 1),
        source: cur === BASE_CURRENCY ? 'Base Currency (EUR)' : (rates ? 'Frankfurter / ECB' : 'fallback rate'),
      },
      amountBase: convertToBase(donationNative, cur, rates),
      tipBase: convertToBase(tipNative, cur, rates),
      grossBase: convertToBase(grossNative, cur, rates),
      feeBase: convertToBase(feeNative, cur, rates),
      netBase: convertToBase(netNative, cur, rates),
    });
  }
  return out;
}

module.exports = {
  BASE_CURRENCY,
  fetchLatestRates,
  fetchRateForDate,
  convertToBase,
  convertPaymentToBase,
  convertPaymentsToBase,
  computePaymentAmounts,
  dayKey,
};
