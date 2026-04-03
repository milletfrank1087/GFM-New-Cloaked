var currencyConfig = { symbol: '€', locale: 'en-US', position: 'before' };

var CURRENCY_SYMBOLS = {
  EUR: '€', USD: '$', PLN: 'zł', GBP: '£', CZK: 'Kč', BRL: 'R$',
  SEK: 'kr', NOK: 'kr', DKK: 'kr', CHF: 'CHF', RON: 'lei', HUF: 'Ft',
  TRY: '₺', AUD: 'A$', CAD: 'C$', JPY: '¥', INR: '₹', MXN: 'MX$'
};

var CURRENCY_POSITIONS = {
  PLN: 'after', CZK: 'after', SEK: 'after', NOK: 'after',
  DKK: 'after', HUF: 'after', RON: 'after', TRY: 'after'
};

async function loadCurrencyConfig() {
  try {
    const res = await fetch('/api/currency/config');
    if (res.ok) currencyConfig = await res.json();
  } catch (e) { console.warn('Currency config fetch failed'); }
}

function formatCurrency(amount, overrideCurrency) {
  const cur = overrideCurrency || null;
  if (cur) {
    const sym = CURRENCY_SYMBOLS[cur] || cur;
    const pos = CURRENCY_POSITIONS[cur] || 'before';
    const locale = cur === 'PLN' ? 'pl-PL' : cur === 'CZK' ? 'cs-CZ' : 'en-US';
    const formatted = parseFloat(amount || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return pos === 'after' ? formatted + sym : sym + formatted;
  }
  const formatted = parseFloat(amount || 0).toLocaleString(currencyConfig.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currencyConfig.position === 'after' ? formatted + currencyConfig.symbol : currencyConfig.symbol + formatted;
}

function formatBaseCurrency(amount) {
  const formatted = parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return '€' + formatted;
}
