// Post-purchase monthly upsell: after a one-time payment succeeds, the customer can turn it into a
// monthly contribution with one tap, reusing the card saved by that payment (setup_future_usage).
// The first monthly charge happens UPSELL_DELAY_DAYS later (trial), never on the same day.
const crypto = require('crypto');

const UPSELL_DELAY_DAYS = 30;
const TOKEN_TTL_MS = 30 * 60 * 1000; // the offer is valid for 30 minutes after payment
const NICE_AMOUNTS = [2, 3, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250];

// Saving the card (setup_future_usage) makes EEA issuers ask for 3DS plus a card-on-file mandate, and hides
// payment methods that can't be saved (MB WAY). Italian/Portuguese EUR traffic converted far worse with it
// (Sep 26+), so EUR pays one-time without it and gets no upsell. Keep in sync with public/js/checkout.js.
const NO_SAVE_CARD_CURRENCIES = ['eur'];

function savesCardForUpsell(currency) {
  return !NO_SAVE_CARD_CURRENCIES.includes(String(currency || '').toLowerCase());
}

function secret() {
  return process.env.CALLBACK_SECRET || 'change-me';
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch (_) { return null; }
}

// Offer token set as an httpOnly cookie by /api/confirm-payment; single use.
function makeOfferToken(data) {
  return sign({ ...data, exp: Date.now() + TOKEN_TTL_MS });
}

function readOfferToken(token) {
  const data = verify(token);
  if (!data || !data.exp || data.exp < Date.now()) return null;
  return data;
}

// Cancel links in emails: HMAC of the subscription id, no expiry.
function cancelToken(subscriptionId) {
  return crypto.createHmac('sha256', secret()).update(`cancel:${subscriptionId}`).digest('base64url').slice(0, 32);
}

function checkCancelToken(subscriptionId, token) {
  const expected = cancelToken(subscriptionId);
  return typeof token === 'string' && token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// Three chips anchored to the one-time amount (~20% / 30% / 50%), snapped to friendly numbers.
function suggestAmounts(oneTimeAmount) {
  const snap = (v) => NICE_AMOUNTS.reduce((best, n) => (Math.abs(n - v) < Math.abs(best - v) ? n : best), NICE_AMOUNTS[0]);
  const out = [...new Set([0.2, 0.3, 0.5].map((f) => snap(Math.max(2, oneTimeAmount * f))))];
  while (out.length < 3) {
    const next = NICE_AMOUNTS.find((n) => n > out[out.length - 1]);
    if (!next) break;
    out.push(next);
  }
  return out.slice(0, 3);
}

function firstChargeDate(from = Date.now()) {
  return new Date(from + UPSELL_DELAY_DAYS * 86_400_000);
}

// One recurring product per store process, found by metadata or created once.
let productIdPromise = null;
function getMonthlyProduct(stripe, storeConfig) {
  if (!productIdPromise) {
    productIdPromise = (async () => {
      try {
        const found = await stripe.products.search({ query: "metadata['type']:'monthly_support' AND active:'true'", limit: 1 });
        if (found.data[0]) return found.data[0].id;
      } catch (_) { /* search unavailable: fall through to create */ }
      const p = await stripe.products.create({
        name: (storeConfig.products && storeConfig.products[0] && storeConfig.products[0].name) || 'Monthly Support',
        metadata: { type: 'monthly_support' },
      });
      return p.id;
    })().catch((err) => { productIdPromise = null; throw err; });
  }
  return productIdPromise;
}

module.exports = {
  UPSELL_DELAY_DAYS,
  savesCardForUpsell,
  makeOfferToken,
  readOfferToken,
  cancelToken,
  checkCancelToken,
  suggestAmounts,
  firstChargeDate,
  getMonthlyProduct,
};
