/**
 * Currency Utility Module
 * Centralized currency formatting for HopeRise
 */

const currency = {
  config: {
    code: 'EUR',
    symbol: '€',
    position: 'before',
    locale: 'en-US'
  },
  loaded: false,

  async init() {
    try {
      const response = await fetch('/api/currency/config');
      if (response.ok) {
        this.config = await response.json();
      }
    } catch (error) {
      console.warn('Currency config fetch failed, using defaults');
    }
    this.loaded = true;
    console.log(`✅ Currency initialized: ${this.config.code} (${this.config.symbol})`);
  },

  format(amount, showDecimals = true) {
    const num = parseFloat(amount) || 0;
    const formatted = num.toLocaleString(this.config.locale, {
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0
    });
    
    if (this.config.position === 'after') {
      return `${formatted}${this.config.symbol}`;
    }
    return `${this.config.symbol}${formatted}`;
  },

  formatCompact(amount) {
    const num = parseFloat(amount) || 0;
    const s = this.config.symbol;
    const after = this.config.position === 'after';
    if (num >= 1000000) {
      const v = (num / 1000000).toFixed(1) + 'M';
      return after ? `${v}${s}` : `${s}${v}`;
    }
    if (num >= 1000) {
      const v = (num / 1000).toFixed(0) + 'K';
      return after ? `${v}${s}` : `${s}${v}`;
    }
    return this.format(num, false);
  },

  getSymbol() {
    return this.config.symbol;
  },

  getCode() {
    return this.config.code;
  },

  isAfter() {
    return this.config.position === 'after';
  }
};

window.currency = currency;
window.formatCurrency = (amount, showDecimals) => currency.format(amount, showDecimals);
