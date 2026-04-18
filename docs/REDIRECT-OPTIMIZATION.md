# Redirect Friction Reduction Playbook

## Problem

The cross-domain redirect (campaign → store) adds 1.5-3+ seconds of perceived wait time. This playbook details every technique to minimize that friction while keeping the two-domain architecture.

---

## Current Redirect Flow (Timing Breakdown)

```
User clicks "Confirm Donation"
  ├─ showRedirectOverlay()                          ~0ms (instant)
  ├─ POST /api/init-donation (create session)       200-400ms
  ├─ window.location.replace(storeUrl/s/TOKEN)      navigation start
  │   ├─ DNS lookup for store domain                50-200ms (mobile)
  │   ├─ TCP + TLS handshake                        150-600ms (mobile)
  │   └─ Server response (/s/:token)                100-300ms
  ├─ /s/:token page (Supabase query + cookie)       100-200ms
  ├─ location.replace('/checkout')                   internal redirect
  └─ /checkout page loads:
      ├─ Google Fonts (DNS + fetch)                 200-400ms
      ├─ Tailwind CDN (DNS + fetch)                 200-400ms
      ├─ Stripe.js (DNS + fetch)                    300-600ms
      ├─ Facebook pixel                             200-300ms
      └─ PaymentElement mount                       200-400ms

TOTAL PERCEIVED WAIT: 1.5-3+ seconds
```

---

## Layer 1: Preconnect from Campaign Page (Saves 200-500ms)

**What:** Add resource hints to `campaign/public/index.html` to warm connections to known third-party origins before the redirect.

**Implementation:**
```html
<!-- In campaign <head>, add after existing preconnects -->
<link rel="preconnect" href="https://js.stripe.com" crossorigin>
<link rel="dns-prefetch" href="https://js.stripe.com">
<link rel="preconnect" href="https://m.stripe.com" crossorigin>
<link rel="dns-prefetch" href="https://m.stripe.com">
```

**Why it works:** Stripe.js (`js.stripe.com`) is the heaviest third-party load on the checkout page. By preconnecting from the campaign page, the DNS + TCP + TLS handshake is already done by the time the user reaches the store checkout. Chrome keeps preconnected sockets open for 10 seconds.

**Why NOT preconnect to the store domain itself:** The store domain is selected via round-robin at redirect time — we don't know which store the user will be sent to when the page loads. We'd have to preconnect to ALL active stores, which wastes connections.

**Trigger timing:** On page load (these origins are guaranteed to be needed).

**Limitations:**
- Chrome closes unused preconnect sockets after 10 seconds
- If user takes >10s to click "Confirm", the preconnect is wasted
- Google Fonts and Tailwind CDN are already preconnected on the campaign page, so those are already warm

---

## Layer 2: Prefetch Critical Assets on Modal Open (Saves 300-600ms)

**What:** When the user opens the donation modal (high-intent signal), dynamically inject `<link rel="prefetch">` tags for assets the checkout page will need.

**Implementation:**
```javascript
function prefetchCheckoutAssets() {
  const assets = [
    { href: 'https://js.stripe.com/v3/', as: 'script' },
    { href: 'https://cdn.tailwindcss.com', as: 'script' }
  ];
  assets.forEach(({ href, as }) => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    link.as = as;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
}
```

**Trigger:** Call `prefetchCheckoutAssets()` when the donation modal opens (add to cart event).

**Why it works:** By the time the user selects an amount, confirms, and gets redirected, Stripe.js and Tailwind are already in the browser's HTTP cache.

**Limitations:**
- Cache partitioning: Modern browsers partition caches by top-level site. A prefetch from `campaign.com` may NOT be reusable on `store.com`. This is the biggest risk.
- Safari doesn't support `<link rel="prefetch">`
- uBlock Origin blocks prefetch requests

**Mitigation:** Even if the full resource isn't cached cross-site, the DNS + TCP + TLS warmup from the preconnect (Layer 1) still saves time.

---

## Layer 3: Improved Progress Overlay (Perceived Perf — Highest Impact)

**What:** Replace the current spinner overlay with a multi-step progress indicator that makes the wait feel active rather than stalled.

**Current overlay:** Static spinner + "Preparing your payment..." text.

**Improved overlay:** Animated progress bar with step-based messaging:
- Step 1 (0-30%): "Preparing your payment..."
- Step 2 (30-60%): "Connecting to secure checkout..."
- Step 3 (60-90%): "Almost ready..."

**Why it works:**
- Users perceive progress indicators as 40% faster than spinners for the same wait time (Stripe internal data)
- Step-based messaging reduces uncertainty ("Is it broken?")
- Facebook found skeleton screens improved perceived performance scores with zero actual speed change
- Research shows 18% abandonment reduction when replacing blank screens with progress messaging during checkout

**Implementation:** Replace `showRedirectOverlay()` in `donation.js` with an animated progress bar that auto-advances through steps on a timer.

---

## Layer 4: HTTP 103 Early Hints on Store Server (Saves 200-400ms)

**What:** Send `103 Early Hints` response from the store server on `/s/:token` and `/checkout` routes with `Link` headers for critical assets, BEFORE the Supabase query finishes.

**Implementation:**
```javascript
router.get('/s/:token', async (req, res) => {
  res.writeEarlyHints({
    link: [
      '</checkout>; rel=preload; as=document',
      '<https://js.stripe.com/v3/>; rel=preconnect; crossorigin',
      '<https://fonts.googleapis.com>; rel=preconnect',
      '<https://fonts.gstatic.com>; rel=preconnect; crossorigin'
    ]
  });
  // ... Supabase query runs while browser pre-warms connections
});
```

**Requirements:**
- Node.js 18.11+ (Railway uses Node 18+ by default)
- HTTP/2 recommended (103 support is better on HTTP/2+)
- Railway's proxy must not strip 103 responses (needs testing)

**Why it works:** While the server spends 100-200ms querying Supabase, the browser is already fetching Stripe.js and warming Google Fonts connections. The browser parallelizes network work with server processing.

---

## Layer 5: Background Fetch on Confirm Click (Saves 100-200ms)

**What:** In `initDonationRedirect()`, after receiving the `redirectUrl` from the API, fire a background `fetch()` to the store URL to warm the connection.

**Implementation:**
```javascript
if (data.redirectUrl) {
  fetch(data.redirectUrl, { mode: 'no-cors', credentials: 'omit' }).catch(() => {});
  window.location.replace(data.redirectUrl);
}
```

**Why it works:** The `fetch()` starts the DNS + TCP + TLS handshake to the store domain before `window.location.replace()` triggers the full navigation. The browser may reuse the in-flight connection.

**Limitations:**
- The `/s/TOKEN` response is not cacheable (one-time-use token)
- `mode: 'no-cors'` means we can't read the response, but connection warming still works
- The `fetch()` might claim the token before the navigation does (race condition) — use `credentials: 'omit'` to avoid sending cookies, which means the token claim won't happen on the fetch

---

## Layer 6: Speculation Rules API (Chrome/Edge Only)

**What:** Use the Speculation Rules API for cross-site prefetch.

**Verdict: Limited utility for our use case.**

- Speculation Rules supports cross-site `prefetch` but NOT cross-site `prerender`
- Cross-site prefetch doesn't work if the user has cookies on the destination site
- Our redirect URL (`/s/TOKEN`) is dynamic and one-time-use — can't be speculated in advance
- The real speed win comes from Layers 1-4 (preconnect + prefetch of static assets)

---

## Implementation Status (April 2026)

All layers below are IMPLEMENTED and deployed.

| Priority | Layer | Impact | Status | File |
|----------|-------|--------|--------|------|
| 1 | Self-host Tailwind + Fonts | 400-800ms | DONE | checkout-donor.ejs, /fonts/, /css/ |
| 2 | Dynamic JS preconnect (multi-trigger) | 200-500ms | DONE | prefetch.js |
| 3 | Animated progress overlay | +40% perceived | DONE | prefetch.js |
| 4 | Background fetch to store root | 150-400ms | DONE | donation.js |
| 5 | HTTP 103 Early Hints | 200-400ms | DONE (degrades gracefully) | token.js |

### Preconnect 10-Second Timeout Fix

Chrome closes idle preconnect sockets after 10 seconds. Users may spend 15-45s in the modal selecting amounts. Solution: re-preconnect on every user interaction (amount click, input focus, confirm hover/touchstart) with an 8-second debounce. The socket is always fresh when the user clicks confirm.

**Total estimated reduction: 1.2-2.5s off perceived load time.**

---

## What Does NOT Work for Our Setup

| Technique | Why It Doesn't Help |
|-----------|-------------------|
| Static preconnect to Stripe in HTML | Visible to Meta/Stripe crawlers — breaks cloaking |
| `<link rel="prefetch">` cross-site | Cache partitioning makes it useless across different top-level sites |
| Speculation Rules API | Dynamic one-time-use token URL, cross-site limitations |
| instant.page / SmartPrefetch | Built for same-origin links; our redirect is cross-origin + programmatic |
| Speculation Rules prerender | Same-origin only; useless for cross-domain |
| Full-page iframe embedding | Stripe explicitly warns against; breaks payment methods |
| CF Worker reverse proxy | Stripe.js telemetry exposes burned campaign domain |

---

## Sources

- Chrome Speculation Rules API docs (developer.chrome.com)
- web.dev: Resource hints guide (preconnect, prefetch, preload)
- MDN: HTTP 103 Early Hints, Cache Partitioning, rel=prefetch
- Node.js `res.writeEarlyHints()` (supported since 18.11)
- Chromium source: preconnect idle timeout (10s), SpdySession creation
- CSS Wizardry: Correctly Configure Preconnections (Dec 2023)
- WebPerfClinic: Resource Hints Complete Guide (Feb 2026)
- Stripe: 40% checkout abandonment reduction with skeleton screens
- Baymard Institute: 70.22% average checkout abandonment (2025-2026)
- WICG/nav-speculation: cross-site prefetch partitioning spec
- Jeff Kaufman: "Why Prefetch Is Broken" — cache partitioning analysis
- Meta Developer Docs: Web Crawlers (facebookexternalhit, Meta-ExternalAds)
- NGINX 1.29.0: Early Hints support (June 2025)
