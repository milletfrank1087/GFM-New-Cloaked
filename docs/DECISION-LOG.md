# Decision Log — All Approaches Evaluated

## Purpose

This document records every traffic routing and optimization approach we researched, the verdict, and the reasoning. It serves as a reference to avoid re-evaluating rejected approaches.

---

## Approach 1: Cloudflare Worker Reverse Proxy

**Concept:** Deploy a CF Worker on the campaign domain that proxies requests to the store server. Users stay on `campaign.com` while the Worker fetches checkout pages from `store.com` in the background. Zero redirect, single domain experience.

**Research:** 4+ rounds including disconfirmation.

**Verdict: REJECTED**

**Reasons:**
1. **Stripe.js telemetry domain mismatch:** Stripe.js reports the domain it loads on (`b.u` / `ured` field). With the proxy, it would report the campaign domain, but the Stripe account is registered to the store domain. This creates a telemetry mismatch on every transaction.
2. **Rotated campaign domains:** Our campaign domains have been previously linked to inactive Stripe accounts (from the old campaign single-domain setup). Any Stripe.js telemetry from these domains is a linking signal.
3. **Operational overhead:** Every campaign domain rotation requires: CF Worker deployment, DNS migration, Payment Method Domains API registration, Apple Pay re-verification, testing. Adds 30-60 min per rotation vs. 5 min with current setup.
4. **Stripebot incompatibility:** Stripebot crawls the merchant's registered domain. If it hits the campaign domain through the proxy, it sees campaign content. UA-based routing to show Stripebot the store = conditional content delivery detectable by manual review.
5. **CF Worker + Stripe SDK issues:** `constructEvent()` fails (must use `constructEventAsync()`), requires `createFetchHttpClient()`, dynamic `require("util")` errors, cookie forwarding complexity.

**When to revisit:** If campaign domains stop being rotated (fresh domains with no Stripe history), AND if post-fix CPA remains >$15 proving redirect is the dominant friction factor.

---

## Approach 2: Iframe Embedding (Store in Campaign Iframe)

**Concept:** Embed the entire store checkout in an `<iframe>` on the campaign domain. User never leaves the campaign domain visually.

**Research:** 3 rounds with disconfirmation.

**Verdict: REJECTED**

**Reasons:**
1. **Stripe's explicit warning:** Stripe documentation says: "Don't embed Stripe.js or Stripe Elements in an iframe, as this may break some payment methods." Apple Pay, Google Pay, and 3D Secure all have cross-origin iframe restrictions.
2. **Browser security:** Third-party cookie blocking (Safari ITP, Chrome's partitioned cookies) prevents the store's `__session` cookie from being set/read inside a cross-origin iframe.
3. **Payment method breakage:** Apple Pay domain verification checks the top-level domain, not the iframe origin. 3D Secure redirects can't return to an iframe context.
4. **No legitimate pattern:** No major payment processor recommends or supports cross-origin iframe integration for checkout.

**When to revisit:** Never. Browser security trends are making this worse, not better.

---

## Approach 3: Zero-Redirect Traffic Filtering (PHP Include / document.write)

**Concept:** Use server-side PHP include or client-side `document.write()` to serve the checkout content directly on the campaign domain, like the top traffic filtering companies do.

**Research:** Analyzed as part of the top 10 routing companies reverse-engineering.

**Verdict: REJECTED (for payment processing)**

**Reasons:**
1. **Designed for ad review compliance, not payment processors:** These techniques manage Meta/Google ad reviewers. Stripe's detection is fundamentally different — it uses client-side telemetry, transaction patterns, and merchant crawlers.
2. **Stripe.js still reports the serving domain:** Whether you PHP-include or `document.write()` the checkout, Stripe.js loads on the campaign domain and reports it in telemetry. Same rotated-domain problem as the CF Worker.
3. **Stripebot still crawls the registered merchant domain:** Filtering the serving domain doesn't change what Stripebot sees when it crawls `store.com`.

**When to revisit:** Never for our use case. These techniques solve a different problem (ad platform compliance) than ours (payment processor safety).

---

## Approach 4: Keep AB Redirect + Optimize Speed

**Concept:** Keep the current two-domain redirect architecture but reduce the perceived friction through preconnect, prefetch, Early Hints, and improved loading UX.

**Verdict: ACCEPTED — Current recommended approach**

**Reasons:**
1. **Domain isolation preserved:** Campaign rotations have zero impact on payment processing. Store domains survive 12-24 months.
2. **Stripe.js telemetry clean:** Stripe.js loads on the store domain where it belongs. No telemetry mismatch.
3. **Stripebot sees real store:** No filtering needed — the store IS a real e-commerce site.
4. **Code bugs were the real CPA killers:** 5 bugs fixed, each directly killing conversions. Post-fix CPA should drop significantly.
5. **Speed optimizations can reduce remaining friction:** Preconnect, prefetch, Early Hints, and progress overlay can save 800-1700ms.

**Implementation:** See `REDIRECT-OPTIMIZATION.md` for the complete playbook.

---

## Approach 5: Stripe Connect (Multi-Domain Platform)

**Concept:** Use Stripe Connect to legitimately operate multiple domains under a platform account, avoiding the need for domain isolation entirely.

**Research:** Mentioned in research, not deeply investigated.

**Verdict: NOT APPLICABLE**

**Reasons:**
1. Stripe Connect requires a legitimate platform business registration
2. The platform account would be the single point of failure — if it's banned, all connected accounts die
3. Doesn't solve the core issue: Stripe would still see donation-like transactions through alternative stores
4. Adds KYC/compliance overhead that defeats the purpose of the architecture

**When to revisit:** If operating model changes to a legitimate platform.

---

## Approach 6: Stripe Payment Method Domains API

**Concept:** Register the campaign domain with Stripe's Payment Method Domains API so Stripe.js telemetry from the campaign domain is "expected."

**Research:** API documented, automatable via `POST /v1/payment_method_domains`.

**Verdict: REJECTED (as standalone solution)**

**Reasons:**
1. Registering a rotated campaign domain with Stripe creates an explicit link between that domain and your Stripe account
2. If the domain was previously linked to inactive accounts, this is a linking signal
3. Doesn't address Stripebot (which crawls the registered domain and would see campaign content)

**When to revisit:** Only useful as part of a CF Worker proxy setup, which is itself rejected.

---

## Summary Decision Matrix

| Approach | Safety | UX Impact | Effort | Verdict |
|----------|--------|-----------|--------|---------|
| CF Worker Reverse Proxy | LOW (telemetry risk) | HIGH (no redirect) | HIGH | REJECTED |
| Iframe Embedding | VERY LOW (breaks payments) | HIGH (no redirect) | MEDIUM | REJECTED |
| PHP/JS Content Filtering | LOW (telemetry risk) | HIGH (no redirect) | MEDIUM | REJECTED |
| **AB Redirect + Optimize** | **HIGH (clean telemetry)** | **MEDIUM (faster redirect)** | **LOW** | **ACCEPTED** |
| Stripe Connect | N/A (not applicable) | N/A | HIGH | NOT APPLICABLE |
| Payment Method Domains | LOW (linking risk) | N/A | LOW | REJECTED |

---

## Key Insight

Every zero-redirect approach fails for the same reason: **Stripe.js telemetry reports the domain it loads on.** If that domain is the campaign domain (which is rotated / linked to past deactivations), it creates a linking signal regardless of how cleverly the content is served. The only safe approach is to keep Stripe.js loading on a clean store domain, which requires the redirect.

The real opportunity is not eliminating the redirect but making it as fast and seamless as possible.
