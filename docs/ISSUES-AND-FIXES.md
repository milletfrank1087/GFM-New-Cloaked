# Issues Found & Fixes Applied

## Overview

During a comprehensive audit of the GFM Cloaked system (April 2026), we identified 5 critical code bugs that were actively destroying conversions. All were fixed and pushed in commit `944765d`.

---

## Bug #1: Decompose ExactMatch Rounding (CRITICAL)

**File:** `store/lib/decompose.js`
**Severity:** Critical — caused payment failures for common donation amounts

**Problem:** When decomposing a donation amount (e.g., €50.00) into fake product line items, the `exactMatch` logic found a product priced at €49.99 (within ±0.01 tolerance) but returned the **product price** (4999 cents) instead of the **actual donation amount** (5000 cents). Stripe then rejected the PaymentIntent because `amount_details (4999) != amount (5000)`.

**Affected Amounts:** €50, €250, and any total landing within ±0.01 of a product price. 22 products in the catalog could trigger this.

**Evidence:** One PT campaign donor attempted €50 across 3 sessions, hitting PAYMENT_FAIL 6 times. They eventually gave up. Log entries showed:
```
PAYMENT_FAIL | ref:glioblastoma-mariana | amount_details (4999) != amount (5000)
```

**Fix:** Changed `price: exactMatch.price` to `price: amount` — always returns the donor's actual amount.

**Impact:** This single bug cost at least 1 confirmed purchase ($92.84 / 8 purchases = $11.61 CPA → would have been $92.84 / 9 = $10.32 CPA if fixed).

---

## Bug #2: AddPaymentInfo Event Firing Too Early (HIGH)

**File:** `store/stores/haven-prints/public/js/checkout.js`
**Severity:** High — corrupted Meta funnel data

**Problem:** The `AddPaymentInfo` pixel event was bound to `paymentElement.on('change', ...)`, which fires when Stripe auto-renders the payment form — NOT when the user actually starts entering card details. This inflated AddPaymentInfo counts and made the funnel data unreliable.

**Evidence:** In logs, AddPaymentInfo fired 0-2 seconds after checkout view, before any human could have typed card numbers.

**Fix:** Changed to `paymentElement.on('focus', ...)` — fires when the user actually clicks into / taps the payment form.

**Post-Fix Evidence:** After deployment, AddPaymentInfo fires 13-39 seconds after checkout view (real user interaction timing).

---

## Bug #3: 1200ms Checkout Initialization Delay (MEDIUM)

**File:** `store/stores/haven-prints/public/js/checkout.js`
**Severity:** Medium — added unnecessary friction

**Problem:** `setTimeout(() => initCheckout(), 1200)` added a 1.2-second artificial delay before Stripe PaymentElement even began loading. On mobile, combined with Stripe.js loading time, users stared at an empty form for 2-3 seconds.

**Fix:** Replaced with direct `initCheckout()` call — PaymentElement mounts immediately.

**Post-Fix Evidence:** Token claim and checkout view now appear back-to-back in logs with no gap.

---

## Bug #4: Card-Only Payment Methods (MEDIUM)

**File:** `store/routes/stripe.js` (2 locations)
**Severity:** Medium — blocked Apple Pay, Google Pay, and other wallet methods

**Problem:** `payment_method_types: ['card']` was hardcoded, preventing Apple Pay, Google Pay, and other payment methods. Apple Pay alone converts at 72% vs 54% for standard card (Shopify data). Also required `paymentMethodTypes: ['card']` on the client side.

**Fix:**
- Server: Replaced with `automatic_payment_methods: { enabled: true }`
- Client: Removed `paymentMethodTypes: ['card']` from `stripe.elements()` config

**Post-Fix Evidence:** Visa and Mastercard both accepted in post-fix donations. Apple Pay / Google Pay now available where supported.

---

## Bug #5: CAPI Purchase Log Hardcoded to Dashes (LOW)

**File:** `campaign/routes/donation.js`
**Severity:** Low — misleading logs, no functional impact

**Problem:** `JourneyLog.purchase()` was called with hardcoded `{ meta: '-', tiktok: '-' }` instead of the actual CAPI response. The `trackPurchase()` function was being called and returning real results (`✓` / `✗`), but the return value was discarded.

**Evidence:** All PURCHASE log entries showed `Meta - TikTok -` while all ADD_TO_CART entries showed `Meta ✓ TikTok ✓`. This initially led us to believe CAPI was broken (it wasn't).

**Fix:** Captured `trackPurchase()` return value into `capiResult` and passed it to `JourneyLog.purchase()`.

**Post-Fix Evidence:** Logs now show `Meta ✓ TikTok ✓` for successful CAPI events.

---

## Post-Fix Verification (5 Donations)

| Fix | Evidence |
|-----|----------|
| Decompose bug | €57.50 payment processed clean. Zero failures. |
| AddPaymentInfo timing | Fires 13-39s after checkout view (user focus). |
| No 1200ms delay | Token claim and checkout view back-to-back. |
| Automatic payment methods | Visa and Mastercard both accepted. |
| CAPI log fix | `Meta ✓ TikTok ✓` instead of hardcoded dashes. |

---

## Known Remaining Issues

1. **CALLBACK_FAIL spam**: Store tries to callback to ALL `CAMPAIGN_CALLBACK_URLS` including non-existent campaign servers. Non-critical but noisy.
2. **Cross-domain redirect friction**: The campaign→store redirect remains the primary CPA risk factor. See `REDIRECT-OPTIMIZATION.md`.
3. **CPA still elevated**: Even with fixes, the redirect adds friction vs. the old same-domain setup. See `CPA-ANALYSIS.md`.

---

# Second Audit (April 2026) — Attribution Correctness

A deeper attribution-focused audit was performed to guarantee 100% correct pixel event attribution for ad reporting. The following bugs were identified and fixed.

## A1. Bug-fixes never propagated to 2 of 3 stores (P0)

**Files:** `store/stores/{nova-essentials,zenflow-tools}/public/js/checkout.js`

**Problem:** Bugs #2/#3/#4 were fixed only in `haven-prints`. The other two stores still had the `change`-firing AddPaymentInfo, the 1.2s delay, and card-only payment methods.

**Fix:** Consolidated all Stripe checkout logic into a single `store/public/js/checkout.js` shared by every store. The per-store files were deleted.

## A2. PayPal flow had no AddPaymentInfo at all (P0)

**Files:** `store/public/js/paypal-*.js`

**Problem:** Neither the card fields nor the wallet buttons fired `AddPaymentInfo`. Purchase was the only funnel event Meta ever received for PayPal stores, producing corrupt campaign attribution when optimising for "Add payment info".

**Fix:** New `store/public/js/paypal-tracking.js` exposes `PP.fireAddPaymentInfo()` with `value` + `currency`. It is called on card-field focus/change and on PayPal/Venmo button click. The event is proxied to the campaign server with the donor's real IP/UA.

## A3. Hard-coded Meta pixel ID in store EJS (P0)

**Files:** `store/stores/*/views/pages/checkout-donor.ejs`

**Problem:** A literal `fbq('init', '1533961664530010')` was baked into the template. Any campaign using a different pixel ID sent AddPaymentInfo to the wrong account.

**Fix:** Campaign `/api/init-donation` now injects `metaPixelId` / `tiktokPixelId` (from `getTrackingConfig`) into the token's `tracking` blob. The store renders the pixel init dynamically from `donor.utm.metaPixelId`.

## A4. Silent host-check drops (P0)

**File:** `campaign/routes/donation.js`

**Problem:** `srcHost !== myHost` dropped events without logging. `www.hoperise.online` vs `hoperise.online` mismatches silently deleted funnel events.

**Fix:** `normalizeHost` strips `www.` and port. `ALLOWED_CAMPAIGN_HOSTS` env adds extra hosts. Mismatches now return `403` with a warn log instead of silently succeeding.

## A5. Invalid server-generated `_fbp` format (P0)

**File:** `campaign/server.js`

**Problem:** The middleware generated `fb.1.{ts}.{base36}` which Meta rejects (spec requires random integer).

**Fix:** `generateFBP()` now emits `fb.1.${Date.now()}.${19-digit random integer}`. Added `sameSite: isProd ? 'None' : 'Lax'` so dev cookies are not rejected.

## A6. Donor IP/UA stripped on store-proxied events (P0)

**File:** `store/routes/token.js` → `campaign/routes/donation.js`

**Problem:** `/api/track-interaction` forwarded events to the campaign server, which used the STORE'S IP / UA instead of the donor's. Meta match quality dropped accordingly.

**Fix:** Store includes a signed `storeProxy { secret, ipAddress, userAgent, email, storeDomain }` block. Campaign verifies `secret === CALLBACK_SECRET` and uses the proxied donor IP/UA/email for CAPI match quality. The client-supplied `sourceUrl = window.location.href` is also forwarded so that CAPI `event_source_url` matches the browser pixel exactly (Meta dedup requirement).

## A7. Empty `value`/`currency` on AddPaymentInfo (P0)

**Files:** `store/public/js/checkout.js`, `store/public/js/paypal-tracking.js`

**Problem:** The browser proxy call sent `data: {}`. Meta's "value-based" campaign optimization needs `value` + `currency` on every funnel event.

**Fix:** Both store-side fire paths now include `{ value, currency }` in the proxied payload and in the browser pixel parameters.

## A8. Purchase `event_id` could silently fall back to `chargeId` (P0)

**Files:** `campaign/lib/tracking/index.js`, `campaign/routes/donation.js`

**Problem:** If `tracking.eventId` was missing, the server silently used the Stripe `charge_id` as the event_id. The browser pixel sent the original client-generated event_id → no dedup, two Purchases counted.

**Fix:** `trackPurchase` now throws when `trackingData.eventId` or `sourceUrl` is missing. `/api/payment-callback` logs and skips CAPI instead of attributing with the wrong id.

## A9. Purchase event_id lost when sessionStorage is wiped (P0)

**Files:** `store/routes/{stripe,paypal}.js`, `campaign/public/js/donation.js`

**Problem:** Browser-side Purchase dedup relied on `sessionStorage['_purchase_event_id']`, which is cleared on cross-domain navigation under some browsers.

**Fix:** Store appends `?status=complete&eid=<eventId>&amt=<amount>&cur=<currency>` to the campaign return URL. Campaign-side `handleDonatedReturn` prefers these URL params and falls back to sessionStorage.

## A10. Store-side duplicate PageView (P1)

**Files:** `store/stores/*/views/pages/checkout-donor.ejs`

**Problem:** A redundant `fbq('track', 'PageView')` fired on the store checkout page, double-counting PageView for every donor.

**Fix:** Removed. The Meta pixel auto-fires PageView on `init`; one per page is correct.

## A11. Meta CAPI hard-coded fallback URL (P1)

**Files:** `campaign/lib/tracking/{meta,tiktok,index}.js`

**Problem:** `event_source_url` fell back to the literal string `'https://hoperise.online/'` whenever `sourceUrl` was missing, pinning attribution to the wrong domain for every non-hoperise campaign.

**Fix:** Both Meta and TikTok adapters now skip sending the event when `eventId` or `sourceUrl` is missing. `/api/track` uses `req.protocol://req.host/` as the only dynamic fallback.

## A12. `external_id` double-hash and missing email propagation (P1)

**Files:** `campaign/lib/tracking/meta.js`, `campaign/public/js/tracking.js`, `campaign/routes/donation.js`

**Problem:** `external_id` fell back to re-hashing `userData.email` instead of using the already-hashed email hash. Additionally, AddToCart/InitiateCheckout/AddPaymentInfo CAPI calls never received the donor's email, so Meta match quality was <0.5.

**Fix:** `buildMetaUserData` uses `userData.emailHash` when present (or hashes `userData.email` otherwise). Tracking module introduces `setUserEmail`/`getUserEmailHash`; the hashed email is cached and attached to every `/api/track` call via `data.emailHash`. Campaign `/api/track` accepts both raw-email-from-trusted-store and pre-hashed-email-from-browser via the new `userData.emailHash` channel.

## A13. TikTok `Pageview` never fired (P1)

**File:** `campaign/public/js/tracking.js`

**Problem:** `trackPageView` returned early before calling `sendToServer`, so no server-side PageView ever reached TikTok CAPI.

**Fix:** `trackPageView` now always calls `sendToServer('PageView', ...)`. The index tracking module still explicitly skips TikTok for `PageView` (TikTok doesn't accept a separate Pageview CAPI in their spec).

## A14. Synchronous CAPI inside `payment-callback` (P1)

**File:** `campaign/routes/donation.js`

**Problem:** `trackPurchase` was awaited before responding to the store, adding ~800-1500ms to every `confirm-payment` response, which delayed the donor's browser redirect back to the campaign.

**Fix:** `payment-callback` now responds immediately and runs the CAPI + journey log inside `setImmediate`.

## A15. No fetch timeouts between servers (P1)

**Files:** `store/routes/{stripe,paypal}.js`, `store/routes/token.js`

**Problem:** Store → Campaign fetches had no `AbortController`, so a stalled campaign server blocked the donor's checkout response indefinitely.

**Fix:** All cross-server fetches now use a 5-second `AbortController` timeout.

## A16. PayPal item-total vs order-total divergence (P1)

**Files:** `store/lib/decompose.js`, `store/routes/paypal.js`

**Problem:** Legacy float-math `decomposeAmount` could produce line items whose total was 1¢ off the order total. PayPal accepted the order but charged the wrong amount.

**Fix:** `decompose.js` refactored to integer cents end-to-end (`toCents`/`fromCents`). `paypal.js` explicitly asserts `itemTotalCents === orderTotalCents` and rejects the order otherwise.

## A17. `clientLocation` never reached CAPI (P1)

**File:** `campaign/routes/donation.js`

**Problem:** `/api/payment-callback` hard-coded `clientLocation: null` for the Purchase CAPI, so `ct` / `country` matching was always empty.

**Fix:** `init-donation` stores the browser-resolved `clientLocation` with the token, and `payment-callback` propagates it into the CAPI `clientInfo`.

## A18. Cookie encode safety (P2)

**File:** `campaign/public/js/tracking.js`

**Problem:** `setCookie`/`getCookie` did not escape `;`, breaking cookies containing special characters (e.g., cached `_utm_data` JSON).

**Fix:** Added `encodeURIComponent`/`decodeURIComponent`.

---

## Files Touched (Second Audit)

- `campaign/server.js`
- `campaign/routes/donation.js`
- `campaign/lib/tracking/{index,meta,tiktok}.js`
- `campaign/public/js/{tracking,donation}.js`
- `store/routes/{token,stripe,paypal}.js`
- `store/lib/decompose.js`
- `store/public/js/{checkout,paypal-tracking,paypal-card-fields,paypal-buttons,checkout-paypal}.js`
- `store/stores/{haven-prints,nova-essentials,zenflow-tools}/views/pages/checkout-donor.ejs`
- DELETED: `store/stores/{haven-prints,nova-essentials,zenflow-tools}/public/js/checkout.js` (consolidated)
