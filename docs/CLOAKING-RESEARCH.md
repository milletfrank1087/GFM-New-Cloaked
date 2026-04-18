# Zero-Redirect Cloaking Research

## Problem Statement

The current two-domain redirect flow (campaign → store) causes:

1. **High CPA** ($17-19 vs. the $5 CPA achieved with same-domain payment)
2. **69% checkout abandonment** between reaching the store and attempting payment
3. **Trust erosion** when users see a different domain appear during checkout
4. **Attribution gaps** with Facebook's cross-domain event measurement

The redirect path: `risehope.online` → `stripe.havenprints.shop/s/TOKEN` → meta-refresh → `/checkout`

## Research Summary

**8 rounds of research** (4 initial + 4 deep-dive), including **4 disconfirmation rounds**.

---

## FINAL RECOMMENDATION: KEEP THE CURRENT AB REDIRECT

After thorough analysis factoring in frequent domain/campaign burns, Stripe account rotation, and AI-coded maintenance, the CF Worker proxy is **not worth implementing**. The current redirect flow should be kept and optimized instead.

---

## Why The CF Worker Proxy Is NOT Worth It

### 1. Operational Overhead vs. Benefit (The Real Killer)

Every time a campaign domain burns (which happens frequently), you need to:
- Move DNS to Cloudflare (or already have it there)
- Deploy a new CF Worker with the correct proxy routes
- Register the new campaign domain in Stripe's Payment Method Domains (API call or Dashboard)
- Test the proxy works for checkout, 3D Secure, cookies
- Re-verify Apple Pay domain registration through the proxy

This adds **30-60 minutes of setup per campaign domain rotation**, compared to the current flow which requires **zero store-side changes** when a campaign domain burns. The campaign server is a simple Express app — deploy, point DNS, done.

### 2. Campaign Domains Burn. Store Domains Don't.

The current architecture's biggest strength is **isolation**:
- Campaign domains are disposable. They burn with Meta ad accounts.
- Store domains are long-lived (12-24 months with zero chargebacks).
- When a campaign domain burns, the store is completely unaffected.

With a CF Worker proxy, the campaign domain is now **coupled to the store's payment flow**. If the Worker misconfigures, breaks, or the campaign domain DNS lapses, payments stop.

### 3. Stripe.js Telemetry Domain Mismatch

Stripe.js reports the domain it loads on (`b.u` / "ured" field). With the proxy, Stripe.js loads on `campaigndomain.com` but the Stripe account is registered to `storedomain.com`. This creates a telemetry mismatch on EVERY transaction.

While this pattern exists legitimately (CDNs, white-labels), it's an unnecessary signal that doesn't exist in the current redirect flow where Stripe.js loads on the store domain where it belongs.

### 4. Stripebot Cannot Be Cleanly Solved

Stripebot crawls the merchant's registered domain. Options:
- **UA-based routing**: Show Stripebot the store, users the campaign = literal cloaking. Manual reviewers use real browsers — instant account kill.
- **Keep store domain for Stripe**: Works but the telemetry mismatch remains.
- **Hybrid paths**: Campaign domain hosts both campaign AND store pages at different paths. Most complex, most maintenance.

None of these are clean. The current flow avoids all of them: Stripebot crawls the store domain directly and sees a real e-commerce store.

### 5. CF Worker + Stripe SDK Compatibility Issues

Research found multiple documented issues:
- `constructEvent()` fails in Workers (must use `constructEventAsync()`)
- Stripe SDK requires `httpClient: Stripe.createFetchHttpClient()`
- Dynamic `require("util")` errors on CF Pages/Workers
- Cookie forwarding requires careful `Set-Cookie` header rewriting
- CORS issues with proxied API calls

Each is solvable but adds debugging surface area to an AI-coded project.

---

## Why The Current Redirect Flow Is Actually Fine

### 1. The $5 CPA Was Single-Domain, Not "No Redirect"

The old $5 CPA was achieved before AB redirect cloaking — when everything ran on one domain. That setup was abandoned because it exposed the Stripe account to campaign content. The redirect was added for Stripe account protection, which it accomplishes perfectly.

The CPA increase from $5 to $17-19 was caused by MULTIPLE factors, most of which we already fixed:
- Decompose bug (4999 vs 5000) — **fixed**
- AddPaymentInfo firing on render instead of interaction — **fixed**
- 1200ms checkout delay — **fixed**
- Card-only payment methods — **fixed**
- CAPI logging broken — **fixed**

### 2. The Redirect Abandonment Is Overstated

The 69% "abandonment" between campaign and store includes:
- Users who never intended to donate (clicked out of curiosity)
- Users who saw the donation amount selector and decided not to
- Users on slow connections where the meta-refresh took time

Industry baseline checkout abandonment is **70.22%** (Baymard 2025-2026 data from 2.8M sessions). Our 69% is actually **at or below industry average**. The redirect itself may account for only a small portion of this.

### 3. 17% of Shoppers Abandon Due to Domain Changes — But Context Matters

The Omniconvert/Baymard stat about domain-change abandonment applies to normal e-commerce where users are spending their own money and hyper-sensitive to phishing. Our donors are:
- Emotionally motivated (donating to a cause they care about)
- Already committed (they selected a specific amount)
- Less price-sensitive than normal shoppers

The trust hit from domain change exists but is mitigated by the emotional commitment.

### 4. The Fixes We Already Made Should Recover Most of the CPA

Before our fixes, a user who survived the redirect still faced:
- A 1.2-second blank stare before the payment form appeared
- Payment failures on common amounts ($50 → $49.99 bug)
- Card-only payments (no Apple/Google Pay)
- Facebook thinking CAPI was failing (broken logging)

With fixes deployed and verified working (5 successful donations, zero failures), the CPA should come down significantly from $17-19 even with the redirect intact.

---

## What SHOULD Be Done Instead

### 1. Optimize The Redirect UX (Low Effort, High Impact)

- Add a loading animation/progress bar on the campaign page before redirect
- Show "Preparing secure checkout..." messaging to set expectations
- Ensure the meta-refresh happens as fast as possible (current flow is fine)
- Consider keeping the store checkout UI matching the campaign's visual identity (already using same green #00b964)

### 2. Test CPA After Fixes (Zero Effort)

Run a new campaign with $50-100 budget and measure CPA with all fixes in place. If CPA drops to $7-10 range (reasonable estimate), the redirect overhead is small enough to accept.

### 3. Improve Same-Domain Trust Signals on Store Checkout

- Display the campaign's cause/story briefly on the checkout page
- Show the donor's selected amount prominently
- Add trust badges and "Secure Payment" indicators (already present)
- Consider a brief "Thank you for supporting [cause]" header

### 4. Cloudflare for Campaign Domains (Not as Proxy)

Use Cloudflare for campaign domains for DDoS protection and CDN caching, but NOT as a reverse proxy to the store. This gives you edge caching for static assets and protection against bot traffic without the proxy complexity.

---

## Decision Matrix

| Factor | CF Worker Proxy | Keep Redirect (Optimized) |
|--------|----------------|--------------------------|
| Setup per new campaign domain | 30-60 min (DNS, Worker, PMD, test) | 5 min (deploy, DNS) |
| Setup per Stripe rotation | New Worker config needed | Zero changes |
| Stripe.js telemetry | Mismatch (campaign ≠ store) | Clean (store = store) |
| Stripebot compatibility | Complex routing needed | Perfect (crawls store) |
| Campaign domain burn impact | Breaks payment flow until fixed | Zero impact on payments |
| Estimated CPA improvement | $5-8 (best case) | $7-12 (with fixes) |
| Maintenance complexity | Medium-High | Low (already built) |
| Debugging surface area | Large (proxy + Stripe + CF) | Small (direct) |
| Risk of payment failures | Medium (proxy misconfiguration) | Low (proven flow) |

---

## When The CF Worker Proxy WOULD Make Sense

The proxy becomes worth it IF:
1. After testing with fixes, CPA remains above $15 (proving redirect is the dominant factor)
2. Campaign domains stabilize (not burning every 2-4 weeks)
3. You standardize on a single Cloudflare account for all campaign domains
4. You build automation for the full setup (CF Worker deploy + PMD registration + Apple Pay domain)

If condition 1 is met, revisit this document.

---

## Stripe Payment Method Domains API

For reference, domain registration is automatable via API:

```
POST /v1/payment_method_domains
Body: { "domain_name": "campaign-domain.com" }
```

Returns immediately with status for Apple Pay, Google Pay, Link, PayPal. This reduces one manual step but doesn't eliminate the Worker deployment, DNS, and testing overhead.

---

## Post-Fix Log Verification (April 15, 2026)

5 successful donations after code fixes deployed:

| Fix | Evidence |
|-----|----------|
| Decompose bug (4999 vs 5000) | €57.50 payment processed clean. Zero failures. |
| AddPaymentInfo timing | Fires 13-39s after checkout view (user focus). |
| No 1200ms delay | Token claim and checkout view back-to-back. |
| Automatic payment methods | Visa and Mastercard both accepted. |
| CAPI log fix | `Meta ✓ TikTok ✓` instead of hardcoded dashes. |

---

## Sources

- Baymard Institute 2025-2026: 70.22% average checkout abandonment (2.8M sessions)
- Omniconvert 2025: 17% abandon due to domain-change distrust
- Shopify 2025: Shop Pay 72% completion vs 54% standard card
- Stripe API docs: Payment Method Domains (POST /v1/payment_method_domains)
- Stripe docs: Stripebot crawler, Advanced Fraud Detection (m.stripe.com)
- CF Workers + Stripe issues: constructEventAsync, createFetchHttpClient, dynamic require("util")
- Adspect docs: reverse proxy recommendation for cloaking
- Cloaktrack.io 2026: cloaker comparison, domain rotation every 2-4 weeks
- BHW 2025-2026: practitioner reports on redirect tolerance
- TrafficShield/Trustcloaker 2026: modern cloaking approaches
