const { AsyncLocalStorage } = require('async_hooks');
const { formatAmount } = require('./currency');

// Same line format as the campaign servers (campaign/lib/logger.js):
//   TIME      MKT VISITOR   STEP          WHAT HAPPENED                                  FLAGS
//   11:13:58  IT  v-23f7d3  ✅ DONATED    €28.75 (€25 + €3.75 tip) · Visa ••7908 · Anna G.
// VISITOR/MKT come from the per-request context (the checkout session carries the campaign's visitor id).
// Routine steps are hidden but counted into an hourly summary; problems get "⚠ ACTION: …".

function getTimestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Europe/Athens' });
}

function fmtAmount(amount, currency) {
  return formatAmount(amount, currency || 'EUR');
}

function extractOriginHost(url) {
  if (!url) return '';
  try { return new URL(url).hostname; } catch (_) { return url; }
}

// "Anna Grimaldi" -> "Anna G."
function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length || /^(anonymous|unknown)$/i.test(parts[0])) return '';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

// Per-request visitor context: { vid, mkt }. Set by the middleware from the __session / __upsell cookies,
// or explicitly with StoreLog.setDonor(tracking) when a checkout link is claimed.
const als = new AsyncLocalStorage();
function context() { return als.getStore() || {}; }

// hidden: counted, not printed. count: hourly-summary bucket. action: fix hint for problems.
const STORE_EVENTS = {
  token_claimed:    { icon: '🎟️', step: 'checkout', count: 'checkouts' },
  token_expired:    { icon: '⏰', step: 'link', action: 'none: visitor used an expired checkout link (sent to shop home)' },
  token_invalid:    { icon: '🚫', step: 'link', count: 'badLinks', action: 'none: used/unknown checkout link (reload or double tap), sent to shop home' },
  token_error:      { icon: '💥', step: 'ERROR' },
  checkout_view:    { hidden: true },
  store_view:       { icon: '🏪', step: 'shop', hidden: true, count: 'shopViews' },
  payment_created:  { hidden: true, count: 'payAttempts' },
  payment_failed:   { icon: '❌', step: 'ERROR', action: 'check Stripe key/account (donors blocked while this repeats)' },
  payment_ok:       { icon: '✅', step: 'DONATED', count: 'donated' },
  confirm_failed:   { icon: '❌', step: 'ERROR', action: 'payment may have succeeded: compare Stripe dashboard with payments table' },
  customer_new:     { hidden: true },
  customer_exists:  { hidden: true },
  customer_insert_failed: { icon: '💥', step: 'DB', action: 'check Supabase customers table' },
  callback_sent:    { hidden: true },
  callback_failed:  { icon: '⚠️', step: 'callback', action: 'campaign did not get the purchase (no Meta Purchase): check CAMPAIGN_CALLBACK_URLS / campaign service' },
  email_sent:       { hidden: true },
  email_failed:     { icon: '⚠️', step: 'email', action: 'check RESEND_API_KEY / Resend dashboard' },
  redirect:         { hidden: true },
  track_proxied:    { hidden: true },
  track_proxy_failed: { icon: '⚠️', step: 'tracking', action: 'check campaign /api/track reachability' },
  store_checkout:   { icon: '🛒', step: 'shop order' },
  webhook_ok:       { hidden: true },
  webhook_fail:     { icon: '❌', step: 'DECLINED', count: 'declined' },
  webhook_dispute:  { icon: '⚠️', step: 'DISPUTE', action: 'respond in Stripe dashboard → Disputes before the deadline' },
  webhook_refund:   { icon: '↩️', step: 'refund' },
  webhook_error:    { icon: '💥', step: 'webhook', action: 'check STRIPE_WEBHOOK_SECRET matches the Stripe endpoint' },
  db_failed:        { icon: '💥', step: 'DB', action: 'check Supabase (row not saved)' },
  paypal_order_created: { hidden: true },
  paypal_order_failed:  { icon: '❌', step: 'ERROR' },
  paypal_capture_failed:{ icon: '❌', step: 'ERROR' },
  applepay_validation:  { icon: '🍎', step: 'apple pay' },
  upsell_shown:     { icon: '💚', step: 'offer', count: 'offers' },
  upsell_other_open:{ icon: '💚', step: 'offer' },
  upsell_accept_click: { hidden: true },
  upsell_declined:  { icon: '💚', step: 'offer', count: 'offerDeclined' },
  upsell_closed:    { icon: '💚', step: 'offer', count: 'offerDeclined' },
  upsell_left_page: { icon: '💚', step: 'offer', count: 'offerLeft' },
  upsell_created:   { icon: '💚', step: 'MONTHLY', count: 'monthly' },
  upsell_failed:    { icon: '❌', step: 'MONTHLY', action: 'visitor saw an error; no subscription created' },
  subscription_renewal: { icon: '🔁', step: 'RENEWAL', count: 'renewals' },
  subscription_payment_failed: { icon: '❌', step: 'RENEWAL', action: 'Stripe retries automatically; subscription marked past_due' },
  subscription_status: { icon: '💚', step: 'monthly' },
  subscription_cancelled: { icon: '💚', step: 'monthly' },
  subscription_save_failed: { icon: '💥', step: 'DB', action: 'subscription exists in Stripe but not in Supabase' },
  subscription_manage: { icon: '⚠️', step: 'monthly' }
};

const newCounters = () => ({ checkouts: 0, payAttempts: 0, donated: 0, totals: {}, declined: 0, offers: 0, offerDeclined: 0, offerLeft: 0, monthly: 0, renewals: 0, badLinks: 0, shopViews: 0, scanner: 0, errors: 0, jsErrors: 0, jsNew: 0, exits: {}, declineKinds: {}, devices: {} });
let counters = newCounters();
const seenClientErrors = new Map(); // signature -> count (process lifetime)
let hour = new Date().getHours();

function line(icon, step, message, flags, toErr) {
  const ctx = context();
  const mkt = String(ctx.mkt || '--').toUpperCase().slice(0, 3).padEnd(3);
  const who = String(ctx.vid || '--').padEnd(9);
  const msg = String(message).replace(/(\d)[.,]00(?!\d)/g, '$1'); // €25.00 -> €25 (logs only)
  const text = `${getTimestamp()}  ${mkt} ${who} ${icon} ${String(step).padEnd(10)} ${msg}${flags ? '   ' + flags : ''}`;
  (toErr ? console.error : console.log)(text);
}

function record(eventKey, cfg) {
  if (cfg.count) counters[cfg.count] += 1;
}

function flushHour(force) {
  const now = new Date();
  if (!force && now.getHours() === hour) return;
  const c = counters;
  if (c.checkouts || c.donated || c.declined || c.scanner || c.errors || c.renewals || c.jsErrors) {
    const label = new Date(now.getTime() - (force ? 0 : 60_000)).toLocaleTimeString('en-GB', { hour: '2-digit', timeZone: 'Europe/Athens' });
    const money = Object.entries(c.totals).map(([cur, v]) => fmtAmount(Math.round(v * 100) / 100, cur)).join(' + ') || '0';
    const order = ['page_loaded', 'form_loading', 'form_ready', 'email', 'card_typing', 'card_complete', 'pay_tapped', 'declined', 'error'];
    const exits = Object.entries(c.exits).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ');
    const extra = [exits ? `unpaid checkouts stopped at: ${exits}` : '', c.jsErrors ? `browser errors ${c.jsErrors} (${c.jsNew} new types)` : ''].filter(Boolean).join(' | ');
    console.log(`── ${label}:00 last hour · ${c.checkouts} checkouts · ${c.donated} donated ${money} · ${c.declined} declined · offer: ${c.offers} shown, ${c.offerDeclined} no-thanks, ${c.offerLeft} left page, ${c.monthly} monthly · ${c.renewals} renewals | ${c.errors} errors · ${c.scanner} scanner hits hidden`);
    if (extra) console.log(`   ${extra}`);
    const kinds = Object.entries(c.declineKinds).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ×${v}`).join(' · ');
    if (kinds) console.log(`   declines by country/bank code: ${kinds}`);
    const devs = Object.entries(c.devices).sort((a, b) => b[1].n - a[1].n).map(([d, v]) => `${d} ${v.paid}/${v.n} paid${v.slow ? ` (${v.slowPaid}/${v.slow} with 3DS-length wait)` : ''}${v.pending ? `, ${v.pending} still open at 90s` : ''}`).join(' · ');
    if (devs) console.log(`   card attempts by device: ${devs}`);
  }
  hour = now.getHours();
  counters = newCounters();
}
setInterval(() => flushHour(false), 30_000).unref();

const StoreLog = {
  // Express middleware: run the request inside a visitor context.
  contextMiddleware(readDonor) {
    return (req, res, next) => {
      let ctx = {};
      try { ctx = readDonor(req) || {}; } catch (_) { ctx = {}; }
      als.run(ctx, next);
    };
  },

  // Called once the visitor is known (e.g. checkout link claimed): tracking = checkout_sessions.tracking.
  setDonor(tracking) {
    const ctx = als.getStore();
    if (ctx && tracking) {
      if (tracking.visitorId) ctx.vid = tracking.visitorId;
      if (tracking.market) ctx.mkt = tracking.market;
    }
  },

  // Money totals for the hourly summary (amount + tip actually charged).
  addDonation(total, currency) {
    const cur = String(currency || 'EUR').toUpperCase();
    counters.totals[cur] = (counters.totals[cur] || 0) + (Number(total) || 0);
  },

  scannerHit() { counters.scanner += 1; },

  // Browser-side checkout monitor (public/js/checkout-monitor.js).
  // Errors: first occurrence of each signature is printed in full (per process), repeats only counted.
  clientError(signature, text) {
    counters.jsErrors += 1;
    if (seenClientErrors.has(signature)) {
      seenClientErrors.set(signature, seenClientErrors.get(signature) + 1);
      return false;
    }
    if (seenClientErrors.size > 500) seenClientErrors.clear();
    seenClientErrors.set(signature, 1);
    counters.jsNew += 1;
    line('🐞', 'browser', text, '', true);
    return true;
  },
  // Furthest step reached by a checkout that ended without paying (hourly summary only).
  checkoutExit(stage) { counters.exits[stage] = (counters.exits[stage] || 0) + 1; },

  // Run fn with a visitor context (webhooks have no cookie, so the PaymentIntent's remembered context is used).
  withContext(ctx, fn) { return als.run(ctx || {}, fn); },

  // Hourly-summary buckets: bank/Stripe reason per country, and card attempts per device.
  declineKind(key) { counters.declineKinds[key] = (counters.declineKinds[key] || 0) + 1; },
  // Browser-reported result of one confirmPayment call: result paid|declined|error|pending, ms = time spent waiting.
  attempt(device, result, ms) {
    const d = counters.devices[device] || (counters.devices[device] = { n: 0, paid: 0, slow: 0, slowPaid: 0, pending: 0 });
    if (result === 'pending') { d.pending += 1; return; }
    d.n += 1;
    if (result === 'paid') d.paid += 1;
    if (ms > 20000) { d.slow += 1; if (result === 'paid') d.slowPaid += 1; }
  },

  event(eventKey, sessionRef, message) {
    const cfg = STORE_EVENTS[eventKey] || { icon: 'ℹ️', step: eventKey.replace(/_/g, ' ') };
    record(eventKey, cfg);
    if (cfg.hidden) return;
    if (!context().vid && sessionRef && sessionRef !== '---' && !/^glioblastoma|^leuc|^leuk/.test(sessionRef)) {
      message = `${message} [${sessionRef}]`;
    }
    line(cfg.icon, cfg.step, message, ''); // informational: ACTION hints are only for errors
  },

  error(eventKey, sessionRef, message) {
    const cfg = STORE_EVENTS[eventKey] || { icon: '❌', step: eventKey.replace(/_/g, ' ') };
    record(eventKey, cfg);
    if (!cfg.count) counters.errors += 1;
    if (!context().vid && sessionRef && sessionRef !== '---' && !/^glioblastoma|^leuc|^leuk/.test(sessionRef)) {
      message = `${message} [${sessionRef}]`;
    }
    line(cfg.icon, cfg.step, message, cfg.action ? `⚠ ACTION: ${cfg.action}` : '', true);
  },

  system(emoji, message) {
    console.log(`${getTimestamp()}  --  ${'--'.padEnd(9)} ${emoji} ${message}`);
  },

  flushHour,

  startup(port, storeName, domain, dbId, processorLabel) {
    const w = 77;
    const C = '\x1b[33m';
    const R = '\x1b[0m';
    const B = '\x1b[1m';
    const D = '\x1b[2m';
    const pad = (s, n = 52) => String(s).padEnd(n);
    const brand = String(storeName || 'Store').toUpperCase();
    const bannerLine = `           🏪 ${B}${brand}${R} - Store Server`;
    const visibleLen = brand.length + 22;
    const bannerPad = ' '.repeat(Math.max(0, w - visibleLen));
    console.log('');
    console.log(`${C}╔${'═'.repeat(w)}╗${R}`);
    console.log(`${C}║${R}${bannerLine}${bannerPad}${C}║${R}`);
    console.log(`${C}╠${'═'.repeat(w)}╣${R}`);
    console.log(`${C}║${R}  🌐 Server:   http://localhost:${pad(port, 45)}${C}║${R}`);
    console.log(`${C}║${R}  🏷️  Store:    ${pad(storeName)}${C}║${R}`);
    console.log(`${C}║${R}  🌍 Domain:   ${pad(domain)}${C}║${R}`);
    console.log(`${C}║${R}  🆔 DB ID:    ${pad(dbId || 'not resolved')}${C}║${R}`);
    console.log(`${C}║${R}  💳 Payment:  ${pad(processorLabel)}${C}║${R}`);
    console.log(`${C}╠${'═'.repeat(w)}╣${R}`);
    console.log(`${C}║${R}  ${D}Log: TIME  MKT VISITOR  STEP  WHAT HAPPENED  (⚠ ACTION = needs you)${R}           ${C}║${R}`);
    console.log(`${C}╚${'═'.repeat(w)}╝${R}`);
    console.log('');
  }
};

module.exports = { StoreLog, getTimestamp, fmtAmount, extractOriginHost, shortName };
