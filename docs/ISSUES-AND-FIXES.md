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
