const CURRENCIES = {
  USD: { code: 'USD', symbol: '$',  position: 'before', decimals: 2, stripeMin: 0.50 },
  EUR: { code: 'EUR', symbol: '€',  position: 'before', decimals: 2, stripeMin: 0.50 },
  GBP: { code: 'GBP', symbol: '£',  position: 'before', decimals: 2, stripeMin: 0.30 },
  PLN: { code: 'PLN', symbol: 'zł', position: 'after',  decimals: 2, stripeMin: 2.00 },
  CHF: { code: 'CHF', symbol: 'CHF', position: 'before', decimals: 2, stripeMin: 0.50 },
  SEK: { code: 'SEK', symbol: 'kr', position: 'after',  decimals: 2, stripeMin: 3.00 },
  NOK: { code: 'NOK', symbol: 'kr', position: 'after',  decimals: 2, stripeMin: 3.00 },
  DKK: { code: 'DKK', symbol: 'kr', position: 'after',  decimals: 2, stripeMin: 2.50 },
  CZK: { code: 'CZK', symbol: 'Kč', position: 'after',  decimals: 2, stripeMin: 15.00 },
  HUF: { code: 'HUF', symbol: 'Ft', position: 'after',  decimals: 2, stripeMin: 175.00 },
  RON: { code: 'RON', symbol: 'lei', position: 'after', decimals: 2, stripeMin: 2.00 },
  BGN: { code: 'BGN', symbol: 'лв', position: 'after',  decimals: 2, stripeMin: 1.00 },
  HRK: { code: 'HRK', symbol: 'kn', position: 'after',  decimals: 2, stripeMin: 4.00 },
  CAD: { code: 'CAD', symbol: 'CA$', position: 'before', decimals: 2, stripeMin: 0.50 },
  AUD: { code: 'AUD', symbol: 'A$', position: 'before', decimals: 2, stripeMin: 0.50 },
  NZD: { code: 'NZD', symbol: 'NZ$', position: 'before', decimals: 2, stripeMin: 0.50 },
  BRL: { code: 'BRL', symbol: 'R$', position: 'before', decimals: 2, stripeMin: 0.50 },
  MXN: { code: 'MXN', symbol: 'MX$', position: 'before', decimals: 2, stripeMin: 10.00 },
  INR: { code: 'INR', symbol: '₹',  position: 'before', decimals: 2, stripeMin: 0.50 },
  HKD: { code: 'HKD', symbol: 'HK$', position: 'before', decimals: 2, stripeMin: 4.00 },
  SGD: { code: 'SGD', symbol: 'S$', position: 'before', decimals: 2, stripeMin: 0.50 },
  AED: { code: 'AED', symbol: 'د.إ', position: 'before', decimals: 2, stripeMin: 2.00 },
  ILS: { code: 'ILS', symbol: '₪',  position: 'before', decimals: 2, stripeMin: 0.50 },
  ZAR: { code: 'ZAR', symbol: 'R',  position: 'before', decimals: 2, stripeMin: 0.50 },
  TRY: { code: 'TRY', symbol: '₺',  position: 'before', decimals: 2, stripeMin: 0.50 },
  JPY: { code: 'JPY', symbol: '¥',  position: 'before', decimals: 0, stripeMin: 50 },
  KRW: { code: 'KRW', symbol: '₩',  position: 'before', decimals: 0, stripeMin: 50 },
  VND: { code: 'VND', symbol: '₫',  position: 'after',  decimals: 0, stripeMin: 5000 },
  IDR: { code: 'IDR', symbol: 'Rp', position: 'before', decimals: 0, stripeMin: 0.50 },
  CLP: { code: 'CLP', symbol: 'CLP$', position: 'before', decimals: 0, stripeMin: 250 },
  BHD: { code: 'BHD', symbol: 'BD', position: 'before', decimals: 3, stripeMin: 0.20 },
  KWD: { code: 'KWD', symbol: 'KD', position: 'before', decimals: 3, stripeMin: 0.15 },
  OMR: { code: 'OMR', symbol: 'OR', position: 'before', decimals: 3, stripeMin: 0.20 },
  JOD: { code: 'JOD', symbol: 'JD', position: 'before', decimals: 3, stripeMin: 0.40 },
  TND: { code: 'TND', symbol: 'DT', position: 'before', decimals: 3, stripeMin: 1.50 },
};

const DEFAULT_META = { code: 'XXX', symbol: '', position: 'before', decimals: 2, stripeMin: 0.50 };

function normalize(code) {
  return String(code || '').toUpperCase();
}

function getMeta(code) {
  const k = normalize(code);
  return CURRENCIES[k] || { ...DEFAULT_META, code: k };
}

function getDecimals(code) {
  return getMeta(code).decimals;
}

function getSymbol(code) {
  return getMeta(code).symbol || normalize(code);
}

function getPosition(code) {
  return getMeta(code).position;
}

function getStripeMin(code) {
  return getMeta(code).stripeMin;
}

function toSmallestUnit(amount, code) {
  const decimals = getDecimals(code);
  const multiplier = Math.pow(10, decimals);
  return Math.round(parseFloat(amount) * multiplier);
}

function fromSmallestUnit(units, code) {
  const decimals = getDecimals(code);
  const divisor = Math.pow(10, decimals);
  return Math.round(units) / divisor;
}

function formatAmount(amount, code, opts = {}) {
  const meta = getMeta(code);
  const num = parseFloat(amount) || 0;
  const val = num.toFixed(meta.decimals);
  if (opts.symbolOnly) return meta.symbol;
  if (meta.position === 'after') return `${val} ${meta.symbol}`.trim();
  return `${meta.symbol}${val}`;
}

function isSupported(code) {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, normalize(code));
}

module.exports = {
  CURRENCIES,
  getMeta,
  getDecimals,
  getSymbol,
  getPosition,
  getStripeMin,
  toSmallestUnit,
  fromSmallestUnit,
  formatAmount,
  isSupported,
};
