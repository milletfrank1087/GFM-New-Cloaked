const { CURRENCY_SYMBOLS } = require('./locale');

function getTimestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Europe/Athens' });
}

function fmtAmount(amount, currency) {
  const sym = CURRENCY_SYMBOLS[currency] || currency || '';
  const val = parseFloat(amount || 0).toFixed(2);
  return `${sym}${val}`;
}

function extractOriginHost(url) {
  if (!url) return '';
  try { return new URL(url).hostname; } catch (_) { return url; }
}

const STORE_EVENTS = {
  token_claimed:    { emoji: '🎟️ ', type: 'TOKEN_CLAIMED' },
  token_expired:    { emoji: '⏰', type: 'TOKEN_EXPIRED' },
  token_invalid:    { emoji: '🚫', type: 'TOKEN_INVALID' },
  token_error:      { emoji: '💥', type: 'TOKEN_ERROR' },
  checkout_view:    { emoji: '👁️ ', type: 'CHECKOUT_VIEW' },
  store_view:       { emoji: '🏪', type: 'STORE_VIEW' },
  payment_created:  { emoji: '💳', type: 'PAYMENT_CREATED' },
  payment_failed:   { emoji: '❌', type: 'PAYMENT_FAIL' },
  payment_ok:       { emoji: '✅', type: 'PAYMENT_OK' },
  confirm_failed:   { emoji: '❌', type: 'CONFIRM_FAIL' },
  customer_new:     { emoji: '👤', type: 'CUSTOMER_NEW' },
  customer_exists:  { emoji: '👤', type: 'CUSTOMER_HIT' },
  callback_sent:    { emoji: '📤', type: 'CALLBACK_SENT' },
  callback_failed:  { emoji: '⚠️ ', type: 'CALLBACK_FAIL' },
  redirect:         { emoji: '🔄', type: 'REDIRECT' },
  track_proxied:    { emoji: '📝', type: 'TRACK_PROXIED' },
  track_proxy_failed: { emoji: '❌', type: 'TRACK_PROXY_FAIL' },
  store_checkout:   { emoji: '🛒', type: 'STORE_ORDER' },
  webhook_ok:       { emoji: '🔔', type: 'WEBHOOK_OK' },
  webhook_fail:     { emoji: '🔔', type: 'WEBHOOK_FAIL' },
  webhook_dispute:  { emoji: '⚠️ ', type: 'WEBHOOK_DISPUT' },
  webhook_refund:   { emoji: '↩️ ', type: 'WEBHOOK_REFUND' },
  webhook_error:    { emoji: '💥', type: 'WEBHOOK_ERR' },
  paypal_order_created: { emoji: '💳', type: 'PP_ORDER_OK' },
  paypal_order_failed:  { emoji: '❌', type: 'PP_ORDER_FAIL' },
  paypal_capture_failed:{ emoji: '❌', type: 'PP_CAPTURE_FAIL' },
  applepay_validation:  { emoji: '🍎', type: 'APPLEPAY_VALID' }
};

const StoreLog = {
  event(eventKey, sessionRef, message) {
    const cfg = STORE_EVENTS[eventKey] || { emoji: 'ℹ️', type: eventKey.toUpperCase() };
    const ref = (sessionRef || '---').padEnd(8);
    console.log(`[${getTimestamp()}] ${cfg.emoji} ${cfg.type.padEnd(15)} │ ${ref} │ ${message}`);
  },

  system(emoji, message) {
    console.log(`[${getTimestamp()}] ${emoji} ${message}`);
  },

  error(eventKey, sessionRef, message) {
    const cfg = STORE_EVENTS[eventKey] || { emoji: '❌', type: eventKey.toUpperCase() };
    const ref = (sessionRef || '---').padEnd(8);
    console.error(`[${getTimestamp()}] ${cfg.emoji} ${cfg.type.padEnd(15)} │ ${ref} │ ${message}`);
  },

  startup(port, storeName, domain, dbId, processorLabel) {
    const w = 77;
    const C = '\x1b[33m';
    const R = '\x1b[0m';
    const B = '\x1b[1m';
    const D = '\x1b[2m';
    const pad = (s, n = 52) => String(s).padEnd(n);
    console.log('');
    console.log(`${C}╔${'═'.repeat(w)}╗${R}`);
    console.log(`${C}║${R}           🏪 ${B}GFM CLOAKED${R} - Store Server                                     ${C}║${R}`);
    console.log(`${C}╠${'═'.repeat(w)}╣${R}`);
    console.log(`${C}║${R}  🌐 Server:   http://localhost:${pad(port, 45)}${C}║${R}`);
    console.log(`${C}║${R}  🏷️  Store:    ${pad(storeName)}${C}║${R}`);
    console.log(`${C}║${R}  🌍 Domain:   ${pad(domain)}${C}║${R}`);
    console.log(`${C}║${R}  🆔 DB ID:    ${pad(dbId || 'not resolved')}${C}║${R}`);
    console.log(`${C}║${R}  💳 Payment:  ${pad(processorLabel)}${C}║${R}`);
    console.log(`${C}╠${'═'.repeat(w)}╣${R}`);
    console.log(`${C}║${R}  ${D}Log: [TIME] EMOJI EVENT │ SESSION  │ MESSAGE${R}                                ${C}║${R}`);
    console.log(`${C}╚${'═'.repeat(w)}╝${R}`);
    console.log('');
  }
};

module.exports = { StoreLog, getTimestamp, fmtAmount, extractOriginHost };
