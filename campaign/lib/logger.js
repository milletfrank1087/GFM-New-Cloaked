const crypto = require('crypto');

const EVENT_CONFIG = {
  'PageView': { emoji: '👤', type: 'NEW_VISITOR' },
  'ViewContent': { emoji: '👀', type: 'VIEW_CONTENT' },
  'AddToCart': { emoji: '🛒', type: 'ADD_TO_CART' },
  'InitiateCheckout': { emoji: '💳', type: 'CHECKOUT' },
  'AddPaymentInfo': { emoji: '📝', type: 'PAYMENT_INFO' },
  'Purchase': { emoji: '✅', type: 'PURCHASE' }
};

const PAYMENT_EVENT_CONFIG = {
  'card_error': { emoji: '❌', type: 'CARD_ERROR', msg: 'Card payment error' },
  'card_validation': { emoji: '⚠️', type: 'CARD_INVALID', msg: 'Card validation failed' },
  'card_3ds_cancel': { emoji: '🔐', type: '3DS_CANCELLED', msg: '3DS verification cancelled' },
  'modal_close': { emoji: '🚪', type: 'MODAL_CLOSED', msg: 'Modal closed without payment' },
  'checkout_abandon': { emoji: '🏃', type: 'ABANDONED', msg: 'Left during checkout' },
  'session_timeout': { emoji: '⏱️', type: 'TIMEOUT', msg: 'Session timed out' },
  'redirect_initiated': { emoji: '🔀', type: 'REDIRECT', msg: 'Redirecting to checkout' }
};

function getTimestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Europe/Athens' });
}

function generateVisitorId(ip) {
  const hash = crypto.createHash('md5')
    .update(ip + Date.now().toString().slice(-6))
    .digest('hex');
  return `v-${hash.substring(0, 6)}`;
}

function isLocalIP(ip) {
  return ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip === 'unknown';
}

function createJourneyLog(fmtCurrency) {
  return {
    formatLocation(visitor) {
      if (visitor.city && visitor.city !== 'Unknown') {
        return `${visitor.city}, ${visitor.country}`;
      }
      return visitor.country !== '??' ? visitor.country : visitor.ip.substring(0, 12);
    },

    formatCAPI(status) {
      if (!status) return '';
      return `| Meta ${status.meta} TikTok ${status.tiktok}`;
    },

    event(visitor, eventName, message, capiStatus) {
      const config = EVENT_CONFIG[eventName] || { emoji: 'ℹ️', type: eventName.toUpperCase() };
      const loc = this.formatLocation(visitor);
      const capi = this.formatCAPI(capiStatus);
      console.log(`[${getTimestamp()}] ${config.emoji} ${config.type.padEnd(15)} │ ${visitor.id} │ ${loc.padEnd(12)} │ ${message} ${capi}`);
    },

    newVisitor(visitor, page, capiStatus) {
      const loc = this.formatLocation(visitor);
      const capi = this.formatCAPI(capiStatus);
      console.log(`[${getTimestamp()}] 👀 NEW_VISITOR      │ ${visitor.id} │ ${loc.padEnd(12)} │ Viewing campaign ${capi}`);
    },

    purchase(visitor, amount, storeDomain, capiStatus) {
      const loc = this.formatLocation(visitor);
      const capi = this.formatCAPI(capiStatus);
      console.log(`[${getTimestamp()}] ✅ PURCHASE         │ ${visitor.id} │ ${loc.padEnd(12)} │ ${fmtCurrency(amount)} via ${storeDomain} ${capi}`);
    },

    paymentEvent(visitor, eventType, details) {
      const config = PAYMENT_EVENT_CONFIG[eventType] || { emoji: '❓', type: 'UNKNOWN', msg: 'Unknown event' };
      const loc = this.formatLocation(visitor);
      const detailStr = details ? ` - ${details}` : '';
      console.log(`[${getTimestamp()}] ${config.emoji} ${config.type.padEnd(15)} │ ${visitor.id} │ ${loc.padEnd(12)} │ ${config.msg}${detailStr}`);
    },

    system(emoji, message) {
      console.log(`[${getTimestamp()}] ${emoji} ${message}`);
    },

    startup(port, campaign, currency, language, trackingStatus) {
      console.log('');
      console.log('\x1b[36m╔═══════════════════════════════════════════════════════════════════════════════╗\x1b[0m');
      console.log('\x1b[36m║\x1b[0m           🔒 \x1b[1mGFM CLOAKED\x1b[0m - Campaign Server                                    \x1b[36m║\x1b[0m');
      console.log('\x1b[36m╠═══════════════════════════════════════════════════════════════════════════════╣\x1b[0m');
      console.log(`\x1b[36m║\x1b[0m  🌐 Server:   http://localhost:${String(port).padEnd(45)}\x1b[36m║\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m  📋 Campaign: ${campaign.padEnd(52)}\x1b[36m║\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m  🌍 Language: ${language.padEnd(52)}\x1b[36m║\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m  💳 Payment:  ${'Cloaked (Stripe + PayPal rotation)'.padEnd(52)}\x1b[36m║\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m  💰 Currency: ${currency.padEnd(52)}\x1b[36m║\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m  📊 Tracking: ${trackingStatus.padEnd(52)}\x1b[36m║\x1b[0m`);
      console.log('\x1b[36m╠═══════════════════════════════════════════════════════════════════════════════╣\x1b[0m');
      console.log('\x1b[36m║\x1b[0m  \x1b[2mLog: [TIME] EMOJI EVENT │ VISITOR-ID │ LOCATION │ MESSAGE\x1b[0m                    \x1b[36m║\x1b[0m');
      console.log('\x1b[36m╚═══════════════════════════════════════════════════════════════════════════════╝\x1b[0m');
      console.log('');
    }
  };
}

module.exports = {
  EVENT_CONFIG,
  PAYMENT_EVENT_CONFIG,
  createJourneyLog,
  getTimestamp,
  generateVisitorId,
  isLocalIP
};
