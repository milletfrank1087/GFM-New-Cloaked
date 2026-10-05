// Payment forensics: everything needed to explain a failed payment from the logs alone.
//  - rememberAttempt(): per-PaymentIntent context captured at creation (visitor, market, device, country, attempt #)
//  - chargeDetails():   what the bank/Stripe actually said (network code, advice, risk, 3DS result, checks, wallet)
//  - failureLine():     one readable log line combining both
//  - recordOutcome():   rolling authorization rate with an early-warning alert
// Context lives in memory (6h): a restart only loses enrichment for attempts still in flight.

const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 3000;
const attempts = new Map();      // paymentIntentId -> context
const sessionAttempts = new Map(); // session id -> [timestamps of PaymentIntents created]

function deviceLabel(ua) {
  ua = String(ua || '');
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : ua ? 'desktop' : '?';
  const app = /FBAN|FBAV|FB_IAB|FBIOS/.test(ua) ? ' FB app' : /Instagram/.test(ua) ? ' IG app' : '';
  return os + app;
}

function prune(now) {
  if (attempts.size <= MAX_ENTRIES) return;
  for (const [k, v] of attempts) if (now - v.t > TTL_MS) attempts.delete(k);
  if (attempts.size > MAX_ENTRIES) attempts.delete(attempts.keys().next().value);
}

// Called right after a PaymentIntent is created. Returns this session's attempt number (1 = first try).
function rememberAttempt(piId, info) {
  const now = Date.now();
  const sid = info.sid || '';
  const list = (sessionAttempts.get(sid) || []).filter((ts) => now - ts < 30 * 60 * 1000);
  list.push(now);
  if (sid) sessionAttempts.set(sid, list);
  if (sessionAttempts.size > MAX_ENTRIES) sessionAttempts.delete(sessionAttempts.keys().next().value);
  const attempt = list.length;
  attempts.set(piId, {
    t: now, attempt, sinceFirstSecs: Math.round((now - list[0]) / 1000),
    vid: info.vid || null, mkt: info.mkt || null, device: deviceLabel(info.ua), ua: info.ua ? String(info.ua).slice(0, 400) : null, ip: info.ip || null,
    geo: info.geo || null, sid: sid.substring(0, 12), src: info.src || null,
    currency: info.currency || null, amount: info.amount || null, sfu: !!info.sfu
  });
  prune(now);
  return attempt;
}

function attemptContext(piId) {
  return attempts.get(piId) || null;
}

// payment_intent.requires_action: the 3DS challenge / bank-app approval (MB WAY) started now.
function markAction(piId, type) {
  const a = attempts.get(piId);
  if (a && !a.actionAt) { a.actionAt = Date.now(); a.actionType = type || null; }
}

// Key raw bank response codes as they appear on the card networks. Unknown codes print as-is.
const NETWORK_CODES = {
  mastercard: {
    '01': 'refer to issuer', '03': 'invalid merchant', '05': 'do not honor', '12': 'invalid transaction',
    '14': 'invalid card number', '51': 'insufficient funds', '54': 'expired', '57': 'txn not permitted to cardholder',
    '58': 'txn not permitted to merchant', '61': 'exceeds amount limit', '62': 'restricted card',
    '63': 'security violation', '65': 'count limit / 3DS soft decline', '82': 'policy decline by issuer',
    '83': 'suspected fraud', '91': 'issuer unavailable', '96': 'system error'
  },
  visa: {
    '05': 'do not honor', '14': 'invalid card number', '51': 'insufficient funds', '54': 'expired',
    '57': 'txn not permitted to cardholder', '59': 'suspected fraud', '61': 'exceeds amount limit',
    '62': 'restricted card', '65': 'count limit', '91': 'issuer unavailable', '96': 'system error',
    '1A': '3DS required', 'N7': 'CVV2 failed'
  }
};

function describeNetworkCode(brand, code) {
  if (!code) return '';
  const label = (NETWORK_CODES[String(brand || '').toLowerCase()] || {})[String(code).toUpperCase()];
  return label ? `${code} (${label})` : String(code);
}

// Pull the diagnostic fields out of a Charge. Never throws; returns {} when the charge is unavailable.
async function chargeDetails(stripe, chargeId) {
  if (!stripe || !chargeId || typeof chargeId !== 'string') return {};
  try {
    const ch = await Promise.race([
      stripe.charges.retrieve(chargeId),
      new Promise((_, rej) => setTimeout(() => rej(new Error('charge lookup timeout')), 4000))
    ]);
    const o = ch.outcome || {};
    const card = (ch.payment_method_details && ch.payment_method_details.card) || {};
    const tds = card.three_d_secure || null;
    return {
      network_status: o.network_status || null,          // approved_by_network | declined_by_network | not_sent_to_network
      outcome_type: o.type || null,                      // authorized | issuer_declined | blocked | manual_review
      outcome_reason: o.reason || null,
      network_decline_code: o.network_decline_code || null,
      network_advice_code: o.network_advice_code || null,
      risk_level: o.risk_level || null,
      risk_score: o.risk_score != null ? o.risk_score : null,
      tds_result: tds ? tds.result : null,               // authenticated | attempt_acknowledged | failed | not_supported ...
      tds_version: tds ? tds.version : null,
      tds_flow: tds ? tds.authentication_flow : null,    // challenge | frictionless
      tds_reason: tds ? tds.result_reason : null,
      cvc_check: card.checks ? card.checks.cvc_check : null,
      zip_check: card.checks ? card.checks.address_postal_code_check : null,
      wallet: card.wallet ? card.wallet.type : null,
      network_token: card.network_token ? !!card.network_token.used : null,
      brand: card.brand || null,
      funding: card.funding || null,
      country: card.country || null,
      last4: card.last4 || null,
      fingerprint: null // set by caller from payment_method when available (kept out of logs)
    };
  } catch (err) {
    return { lookup_error: err.message };
  }
}

function threeDsLabel(d) {
  if (!d || !d.tds_result) return '3DS none';
  const flow = d.tds_flow === 'challenge' ? 'challenge' : d.tds_flow === 'frictionless' ? 'frictionless' : '';
  return `3DS ${flow ? flow + ' ' : ''}${d.tds_result}${d.tds_version ? ' v' + d.tds_version : ''}`;
}

// "IT mastercard prepaid ••3420 · bank 82 (policy decline) advice try_again_later · risk normal · 3DS challenge authenticated v2.2 · apple_pay · try #2 (+34s) · Android FB app"
function failureLine(piId, lpe, d, a) {
  const brand = d.brand || (lpe.payment_method && lpe.payment_method.card && lpe.payment_method.card.brand) || '';
  const parts = [];
  const who = [d.country || (lpe.payment_method && lpe.payment_method.card && lpe.payment_method.card.country) || '', brand, d.funding || ''].filter(Boolean).join(' ');
  parts.push(who + (d.last4 ? ` ••${d.last4}` : ''));
  const code = lpe.network_decline_code || d.network_decline_code;
  const advice = lpe.advice_code || d.network_advice_code;
  if (code || advice) parts.push(`bank ${describeNetworkCode(brand, code)}${advice ? ' advice ' + advice : ''}`.trim());
  if (d.outcome_type && d.outcome_type !== 'issuer_declined') parts.push(`${d.outcome_type}${d.outcome_reason ? ' ' + d.outcome_reason : ''}`);
  if (d.risk_level) parts.push(`risk ${d.risk_level}${d.risk_score != null ? ' ' + d.risk_score : ''}`);
  if (d.tds_result !== undefined || d.network_status) parts.push(threeDsLabel(d));
  if (d.wallet) parts.push(d.wallet);
  if (d.cvc_check && d.cvc_check !== 'pass') parts.push(`cvc ${d.cvc_check}`);
  if (a) {
    parts.push(`try #${a.attempt}${a.attempt > 1 ? ` (+${a.sinceFirstSecs}s)` : ''}`);
    parts.push(a.device + (a.geo ? ` · geo ${a.geo}` : ''));
  }
  return parts.filter(Boolean).join(' · ');
}

// Rolling authorization-rate monitor: warns when most recent card outcomes are failures.
const WINDOW_MS = 45 * 60 * 1000;
const MIN_SAMPLES = 10;
const ALERT_BELOW = 0.5;
let outcomes = []; // { t, ok, country, code }

function recordOutcome(ok, meta, emitAlert) {
  const now = Date.now();
  outcomes.push({ t: now, ok: !!ok, country: (meta && meta.country) || '', code: (meta && meta.code) || '' });
  outcomes = outcomes.filter((o) => now - o.t < WINDOW_MS).slice(-200);
  if (ok || !emitAlert || outcomes.length < MIN_SAMPLES) return;
  const rate = outcomes.filter((o) => o.ok).length / outcomes.length;
  if (rate >= ALERT_BELOW) return;
  const tally = {};
  outcomes.filter((o) => !o.ok).forEach((o) => { const k = `${o.country || '?'}:${o.code || '?'}`; tally[k] = (tally[k] || 0) + 1; });
  const top = Object.entries(tally).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => `${k}×${v}`).join(' ');
  emitAlert({
    key: 'auth-rate-low', severity: 'warning', title: `Payment success rate ${Math.round(rate * 100)}% (last ${Math.round(WINDOW_MS / 60000)} min)`,
    context: { samples: outcomes.length, ok: outcomes.filter((o) => o.ok).length, top_failures: top,
      hint: 'See ❌ DECLINED lines: bank code + 3DS + device show whether it is the bank, 3DS or Radar' }
  });
}

module.exports = { deviceLabel, rememberAttempt, attemptContext, markAction, chargeDetails, failureLine, describeNetworkCode, recordOutcome };
