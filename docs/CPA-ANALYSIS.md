# CPA Analysis & Investigation

## Timeline

| Period | CPA | Setup |
|--------|-----|-------|
| Before April 2026 | ~$5 | Single domain (campaign + Stripe on same server) — "GFM New" project |
| April 1, 2026 | — | Created "GFM New Store" with two-domain AB redirect architecture |
| April 11-13, 2026 | $17-19 | First ad run with new architecture (PT + FR campaigns) |
| April 15, 2026 | — | 5 code fixes deployed and verified |
| Post-fixes | Still elevated | Redirect friction remains, but code bugs eliminated |

---

## Campaign Metrics (April 11-13)

### PT Campaign (Portuguese — Mariana Glioblastoma)

| Metric | Value |
|--------|-------|
| Spend | $92.84 |
| Reach | 5,219 |
| Impressions | 6,930 |
| Unique Link Clicks | 347 |
| Landing Page Views | ~336 (from server logs) |
| Donation Modals Opened | 44 |
| Checkouts Initiated / Redirected | 38 |
| Token Claims on Store | ~40 |
| Payment Form Views | 38 |
| Payment Failures | 6 (all decompose bug) |
| Successful Payments | 8 |
| CPA | $11.61 |

### FR Campaign (French)

| Metric | Value |
|--------|-------|
| Spend | $79.71 |
| Reach | 1,928 |
| Impressions | 2,640 |
| Unique Link Clicks | 120 |
| Purchases | 0 reported |

---

## Funnel Drop-Off Analysis

```
347 unique clicks → 336 landing page views (97% — normal)
336 page views → 44 modal opens (13% — engagement rate)
44 modal opens → 38 redirects (86% — good)
38 redirects → 38 checkout views (100% — redirect survival)
38 checkout views → ~30 payment attempts (79%)
~30 attempts → 8 successes (27% — LOW, bugs killed conversions)
```

### Key Bottleneck: Payment Attempt → Success (27%)

This 27% success rate was caused by the decompose bug (6 failures on 50 EUR), the 1200ms delay causing abandonment, and card-only payment methods.

**Corrected CPA if decompose bug was fixed:** $92.84 / 9 = **$10.32** (1 more purchase from the persistent 50 EUR donor)

**Estimated CPA with all bugs fixed:** $92.84 / 11-12 = **$7.74-$8.44** (accounting for reduced abandonment from faster checkout + Apple Pay)

---

## Why CPA Jumped from $5 to $17-19

### Factor 1: Architecture Change (Primary)
The old "GFM New" project ran everything on one domain. Stripe.js loaded directly on the campaign domain. No redirect, no domain change, no trust break. The new two-domain architecture adds a cross-domain redirect that introduces friction.

### Factor 2: Code Bugs (Major — Now Fixed)
Five bugs were actively destroying conversions. See `ISSUES-AND-FIXES.md`.

### Factor 3: Attribution Gaps
Cross-domain redirect may reduce Facebook's ability to attribute conversions to ad clicks. The Aggregated Event Measurement (AEM) configuration and domain verification status affect iOS attribution.

### Factor 4: First-Run Effects
The new architecture had zero warm-up. Stripe accounts were fresh, Facebook pixel had no optimization data for the new funnel, and ad creative was untested with the new flow.

---

## Facebook Events Manager Status

Facebook Events Manager confirmed Purchase events ARE being received:
- Purchase: Active, EMQ 8.2/10
- 205 browser events + 225 server events received
- CAPI is working (initially misdiagnosed as broken due to hardcoded log dashes)

The issue is not event delivery — it's attribution (Ads Manager not attributing all purchases to specific ad clicks).

---

## Projected CPA After Fixes

| Scenario | Estimated CPA | Basis |
|----------|--------------|-------|
| Pre-fix (actual) | $11.61 (PT) | 8 purchases / $92.84 |
| Post-fix (conservative) | $8-10 | Bug fixes recover ~30% of lost conversions |
| Post-fix + redirect optimization | $6-8 | Speed improvements recover ~15% more |
| Theoretical ceiling (same-domain) | $5 | Original setup, no redirect friction |

---

## Recommendations

1. **Run a $100 test campaign** with all fixes deployed — measure actual post-fix CPA
2. **Implement redirect speed optimizations** (see `REDIRECT-OPTIMIZATION.md`) — preconnect, prefetch, progress overlay
3. **Monitor Facebook attribution** — verify AEM is configured and domain is verified
4. **Track funnel conversion rates** per stage to identify remaining bottlenecks
