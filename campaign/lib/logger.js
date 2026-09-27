const crypto = require('crypto');

// Log line format, shared with the store (store/lib/logger.js):
//   TIME      MKT DONOR     STEP          WHAT HAPPENED                                  FLAGS
//   11:13:58  IT  v-23f7d3  ✅ DONATED    €28.75 (€25 + €3.75 tip) · Anna G. · 2m 02s    ⚠ Meta ✗
// The donor id (v-xxxxxx) travels to the store with the checkout, so one search shows a whole journey.
// Tracking status is only printed when it failed. Routine steps are counted into an hourly summary.

const EVENT_CONFIG = {
  PageView: { icon: '👀', step: 'visit' },
  ViewContent: { icon: '👀', step: 'visit' },
  Lead: { icon: '✍️', step: 'signed' },
  AddToCart: { icon: '🛒', step: 'form' },
  InitiateCheckout: { icon: '➜', step: 'checkout', hidden: true }, // the redirect line carries the amounts
  AddPaymentInfo: { icon: '💳', step: 'card' },
  Purchase: { icon: '✅', step: 'return', hidden: true } // browser Purchase on return; DONATED comes from the store callback
};

const PAYMENT_EVENT_CONFIG = {
  card_error: { icon: '❌', step: 'card', msg: 'card payment error' },
  card_validation: { icon: '⚠️', step: 'card', msg: 'card details rejected' },
  card_3ds_cancel: { icon: '🔐', step: 'card', msg: '3-D Secure cancelled' },
  modal_close: { icon: '🚪', step: 'form', msg: 'closed the donation form without paying' },
  checkout_abandon: { icon: '🏃', step: 'form', msg: 'left during checkout' },
  session_timeout: { icon: '⏱️', step: 'form', msg: 'session timed out' },
  redirect_initiated: { icon: '➜', step: 'checkout', msg: '' },
  cadence_selected: { icon: '🔁', step: 'cadence', msg: '', hidden: true },
  subscribed: { icon: '💚', step: 'MONTHLY', msg: '✓' }
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

// "Anna Grimaldi" -> "Anna G."
function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length || /^(anonymous|unknown)$/i.test(parts[0])) return '';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

// Only failures are shown: "⚠ Meta ✗" / "⚠ Meta SKIP(no-eid)".
function trackingFlags(status) {
  if (!status) return '';
  const bad = [];
  if (status.meta && status.meta !== '✓' && status.meta !== '-') bad.push(`Meta ${status.meta}`);
  if (status.tiktok && status.tiktok !== '✓' && status.tiktok !== '-') bad.push(`TikTok ${status.tiktok}`);
  return bad.length ? `⚠ ${bad.join(', ')}` : '';
}

function sourceOf(url) {
  try {
    const u = new URL(url);
    const src = (u.searchParams.get('utm_source') || '').toLowerCase();
    if (src === 'ig' || src.includes('insta')) return 'Instagram ad';
    if (u.searchParams.get('fbclid') || src === 'fb' || src.includes('facebook')) return 'Facebook ad';
    if (src) return src;
  } catch (_) {}
  return 'direct';
}

function createJourneyLog(fmtCurrency, { market = '--' } = {}) {
  const MKT = String(market).toUpperCase().slice(0, 3).padEnd(3);
  const seenVisitors = new Set();
  const newCounters = () => ({ visits: 0, returning: 0, forms: 0, checkouts: 0, cards: 0, donated: 0, total: 0, monthly: 0, tracked: 0, trackFail: 0 });
  let hour = new Date().getHours();
  let c = newCounters();

  function line(visitorId, icon, step, message, flags) {
    const f = flags ? `   ${flags}` : '';
    console.log(`${getTimestamp()}  ${MKT} ${String(visitorId || '--').padEnd(9)} ${icon} ${String(step).padEnd(10)} ${message}${f}`);
  }

  function countTracking(status) {
    if (!status) return;
    c.tracked += 1;
    if (trackingFlags(status)) c.trackFail += 1;
  }

  function flushHour(force) {
    const now = new Date();
    if (!force && now.getHours() === hour) return;
    const label = new Date(now.getTime() - (force ? 0 : 60_000)).toLocaleTimeString('en-GB', { hour: '2-digit', timeZone: 'Europe/Athens' });
    if (c.visits || c.forms || c.donated || c.monthly) {
      const metaOk = c.tracked ? Math.round(100 * (c.tracked - c.trackFail) / c.tracked) : 100;
      console.log(`── ${label}:00 last hour · ${MKT.trim()} ${c.visits} visits (${c.returning} returning) · ${c.forms} forms · ${c.checkouts} checkouts · ${c.donated} donated ${fmtCurrency(Math.round(c.total * 100) / 100)} · ${c.monthly} monthly | tracking ok ${metaOk}%`);
    }
    hour = now.getHours();
    c = newCounters();
  }
  setInterval(() => flushHour(false), 30_000).unref();

  return {
    market: MKT.trim(),

    formatLocation(visitor) {
      if (visitor.city && !['Unknown', 'Local'].includes(visitor.city)) {
        const city = visitor.city.length > 22 ? visitor.city.slice(0, 21) + '…' : visitor.city;
        return city;
      }
      return visitor.country && visitor.country !== '??' ? visitor.country : '';
    },

    event(visitor, eventName, message, capiStatus) {
      const cfg = EVENT_CONFIG[eventName] || { icon: 'ℹ️', step: eventName };
      countTracking(capiStatus);
      if (eventName === 'AddToCart') c.forms += 1;
      if (eventName === 'InitiateCheckout') c.checkouts += 1;
      if (eventName === 'AddPaymentInfo') c.cards += 1;
      const flags = trackingFlags(capiStatus);
      if (cfg.hidden && !flags) return;
      const text = { AddToCart: 'opened donation form', AddPaymentInfo: 'typing card details', Lead: 'signed the petition' }[eventName] || message;
      line(visitor.id, cfg.icon, cfg.step, text, flags);
    },

    // First visit: "landed from Facebook ad · Verona"; later visits: "↺ back on the campaign page".
    newVisitor(visitor, sourceUrl, capiStatus) {
      countTracking(capiStatus);
      const flags = trackingFlags(capiStatus);
      if (seenVisitors.has(visitor.id)) {
        c.returning += 1;
        line(visitor.id, '↺', 'back', 'back on the campaign page', flags);
        return;
      }
      seenVisitors.add(visitor.id);
      if (seenVisitors.size > 5000) seenVisitors.clear();
      c.visits += 1;
      const loc = this.formatLocation(visitor);
      line(visitor.id, '👀', 'visit', `landed from ${sourceOf(sourceUrl)}${loc ? ' · ' + loc : ''}`, flags);
    },

    // info: { amount, tip, total, store, name }
    purchase(visitor, info, capiStatus) {
      countTracking(capiStatus);
      const donation = Number(info.amount) || 0;
      const tip = Number(info.tip) || 0;
      const total = Number(info.total) || donation + tip;
      c.donated += 1;
      c.total += total;
      const parts = [tip > 0 ? `${fmtCurrency(total)} (${fmtCurrency(donation)} + ${fmtCurrency(tip)} tip)` : fmtCurrency(total)];
      const who = shortName(info.name);
      if (who) parts.push(who);
      if (visitor.firstSeen) parts.push(`${duration(Date.now() - visitor.firstSeen)} from landing`);
      if (info.store) parts.push(`via ${String(info.store).replace(/^www\./, '')}`);
      line(visitor.id, '✅', 'DONATED', parts.join(' · '), trackingFlags(capiStatus));
    },

    paymentEvent(visitor, eventType, details, capiStatus) {
      const cfg = PAYMENT_EVENT_CONFIG[eventType] || { icon: 'ℹ️', step: eventType, msg: '' };
      if (eventType === 'subscribed') c.monthly += 1;
      if (cfg.hidden) return;
      const text = [cfg.msg, details].filter(Boolean).join(' ');
      line(visitor.id, cfg.icon, cfg.step, text, trackingFlags(capiStatus));
    },

    system(emoji, message) {
      console.log(`${getTimestamp()}  ${MKT} ${'--'.padEnd(9)} ${emoji} ${message}`);
    },

    flushHour,

    startup(port, campaign, currency, language, trackingStatus) {
      const w = 79;
      const brand = String(campaign || 'campaign').toUpperCase().replace(/-/g, ' ');
      const bannerCore = `           📋 \x1b[1m${brand}\x1b[0m - Campaign Server`;
      const visibleLen = brand.length + 27;
      const bannerPad = ' '.repeat(Math.max(0, w - visibleLen));
      console.log('');
      console.log(`\x1b[36m╔${'═'.repeat(w)}╗\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m${bannerCore}${bannerPad}\x1b[36m║\x1b[0m`);
      console.log(`\x1b[36m╠${'═'.repeat(w)}╣\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m  🌐 Server:   http://localhost:${String(port).padEnd(45)}\x1b[36m║\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m  📋 Campaign: ${campaign.padEnd(52)}\x1b[36m║\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m  🌍 Market:   ${`${MKT.trim()} · ${language}`.padEnd(52)}\x1b[36m║\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m  💳 Payment:  ${'Stripe + PayPal'.padEnd(52)}\x1b[36m║\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m  💰 Currency: ${currency.padEnd(52)}\x1b[36m║\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m  📊 Tracking: ${trackingStatus.padEnd(52)}\x1b[36m║\x1b[0m`);
      console.log(`\x1b[36m╠${'═'.repeat(w)}╣\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m  \x1b[2mLog: TIME  MKT DONOR  STEP  WHAT HAPPENED  (⚠ = tracking/ops problem)\x1b[0m        \x1b[36m║\x1b[0m`);
      console.log(`\x1b[36m╚${'═'.repeat(w)}╝\x1b[0m`);
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
  isLocalIP,
  shortName
};
