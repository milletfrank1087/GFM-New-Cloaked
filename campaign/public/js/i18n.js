/**
 * Internationalization (i18n) Module
 * Lightweight translation system for HopeRise
 */

const i18n = {
  currentLang: 'en',
  translations: {},
  loaded: false,

  /**
   * Initialize i18n system
   */
  async init() {
    // Get language from HTML lang attribute or default
    this.currentLang = document.documentElement.lang || 'en';
    await this.loadTranslations(this.currentLang);
    this.applyTranslations();
    this.loaded = true;
    console.log(`✅ i18n initialized: ${this.currentLang}`);
  },

  /**
   * Load all translation files for a language
   */
  async loadTranslations(lang) {
    const namespaces = ['common', 'donation', 'faq', 'legal', 'admin'];
    const loadPromises = namespaces.map(async (ns) => {
      try {
        const response = await fetch(`/locales/${lang}/${ns}.json?v=${Date.now()}`);
        if (response.ok) {
          const data = await response.json();
          this.translations[ns] = data;
        }
      } catch (error) {
        console.warn(`Failed to load ${ns}.json for ${lang}`);
      }
    });
    await Promise.all(loadPromises);
  },

  /**
   * Get a translation by key (dot notation supported)
   * @param {string} key - Translation key like "common.nav.story" or "donation.modal.title"
   * @param {object} params - Optional parameters for interpolation
   * @returns {string}
   */
  t(key, params = {}) {
    const parts = key.split('.');
    let value = this.translations;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        // Return key if not found
        return key;
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    // Interpolate parameters ${param}
    let result = value.replace(/\$\{(\w+)\}/g, (match, paramName) => {
      return params[paramName] !== undefined ? params[paramName] : match;
    });
    
    // Replace {{currency}}N patterns with position-aware formatting
    if (typeof currency !== 'undefined' && currency.loaded) {
      result = result.replace(/\{\{currency\}\}(\d+(?:[.,]\d+)?)/g, (match, num) => {
        return currency.format(parseFloat(num), false);
      });
      result = result.replace(/\{\{currency\}\}/g, currency.getSymbol());
    } else {
      result = result.replace(/\{\{currency\}\}/g, '€');
    }
    
    return result;
  },

  /**
   * Apply translations to all elements with data-i18n attribute
   */
  applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = this.t(key);
      
      // Check if we should set innerHTML or textContent
      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = translation;
      } else {
        el.textContent = translation;
      }
    });

    // Handle placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = this.t(key);
    });

    // Handle titles/tooltips
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.title = this.t(key);
    });
  },

  /**
   * Change language dynamically
   */
  async setLanguage(lang) {
    if (lang === this.currentLang) return;
    
    this.currentLang = lang;
    document.documentElement.lang = lang;
    await this.loadTranslations(lang);
    this.applyTranslations();
    
    // Dispatch event for other modules to react
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
  },

  /**
   * Get current language
   */
  getLang() {
    return this.currentLang;
  }
};

// Export for use in other modules
window.i18n = i18n;

// Shorthand translation function
window.t = (key, params) => i18n.t(key, params);
