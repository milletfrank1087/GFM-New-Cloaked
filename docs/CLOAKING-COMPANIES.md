# Top Cloaking Companies — Reverse-Engineered Analysis

## Purpose

Identify how the top 10 cloaking services achieve zero-redirect delivery and advanced bot detection, and compare their approaches to our current AB redirect system.

---

## Top 10 Companies Ranked

### Tier 1: Enterprise-Grade (Full Stack)

**1. Keitaro (keitaro.io)**
- Integration: Self-hosted PHP tracker, acts as reverse proxy or redirect
- Bot Detection: IP database (130M+), UA matching, JavaScript challenges, behavioral fingerprinting
- Zero-Redirect: PHP `file_get_contents()` / cURL on the server to fetch and inject safe page content
- Unique: Full traffic distribution system (TDS), split-testing, multi-offer rotation
- Pricing: $99+/month self-hosted

**2. Adspect (adspect.ai)**
- Integration: PHP/JS snippet or reverse proxy (recommended)
- Bot Detection: ML/AI scoring engine, VLA (Virtual Learning Agent), IP reputation, device fingerprinting
- Zero-Redirect: Reverse proxy mode serves both safe and money pages from same URL
- Unique: Claims ML model trained on billions of visits, real-time scoring
- Pricing: $149+/month

**3. Traffic Armor (trafficarmor.com)**
- Integration: API-based, JavaScript pixel + server-side verification
- Bot Detection: IP scoring API, device fingerprinting, behavioral analysis, ISP/ASN classification
- Zero-Redirect: API returns allow/block decision, page renders content conditionally
- Unique: Real-time API with <50ms response, used by major affiliate networks
- Pricing: Custom / per-click pricing

### Tier 2: Purpose-Built Cloakers

**4. HideClick (hideclick.me)**
- Integration: PHP include on landing page
- Bot Detection: IP databases, UA patterns, JavaScript execution checks, timing analysis
- Zero-Redirect: PHP server-side content switching — same URL serves different HTML
- Unique: Specifically built for affiliate/media-buy cloaking
- Pricing: $145+/month

**5. Cloakerly (cloakerly.com)**
- Integration: JavaScript snippet + DNS-level routing
- Bot Detection: Multi-layer (IP, UA, JS fingerprint, behavioral heuristics)
- Zero-Redirect: DNS-level split or JavaScript `document.write()` content injection
- Unique: Focuses on Google Ads and Meta compliance evasion
- Pricing: $99+/month

**6. TrafficShield (various implementations)**
- Integration: Cloudflare Worker or edge function
- Bot Detection: IP reputation, TLS fingerprinting, behavioral scoring
- Zero-Redirect: Edge-level content switching before request hits origin
- Unique: Operates at CDN edge, sub-5ms decision latency
- Pricing: Varies

### Tier 3: Simpler/Newer Solutions

**7. Cloaking.house**
- Integration: JavaScript tag or PHP include
- Bot Detection: IP databases, UA matching, basic JavaScript challenges
- Zero-Redirect: Client-side JS replaces page content via `document.write()` or DOM manipulation
- Unique: Simple setup, targets beginners
- Pricing: $49+/month

**8. JustCloakIt (justcloakit.com)**
- Integration: URL-based redirect or JavaScript injection
- Bot Detection: IP databases, referrer analysis, geo-filtering
- Zero-Redirect: JavaScript injection mode serves different content on same URL
- Unique: Very simple interface, quick setup
- Pricing: $69+/month

**9. ZeroCloak**
- Integration: PHP reverse proxy
- Bot Detection: IP + UA + JavaScript execution
- Zero-Redirect: Full PHP proxy — fetches money page server-side, serves to visitor
- Unique: Name literally references zero-redirect as core feature
- Pricing: $79+/month

**10. CloakTrack**
- Integration: Tracking link + redirect or JavaScript
- Bot Detection: IP databases, click fraud detection, device fingerprinting
- Zero-Redirect: Optional JavaScript mode with content injection
- Unique: Combines cloaking with conversion tracking
- Pricing: $59+/month

---

## Technical Architecture Comparison

### How They Achieve Zero-Redirect

| Method | Companies | How It Works |
|--------|-----------|-------------|
| PHP Server-Side Include | Keitaro, HideClick, ZeroCloak | Server fetches money page via cURL, serves HTML to visitor. URL never changes. |
| Reverse Proxy | Adspect, TrafficShield | Edge/server proxies entire request to money page origin. Transparent to browser. |
| JavaScript Injection | Cloakerly, Cloaking.house, JustCloakIt | `document.write()` or DOM replacement — replaces safe page HTML with money page content client-side. |
| API Decision + Conditional Render | Traffic Armor | API call returns verdict, server renders appropriate content. |
| DNS-Level Routing | Cloakerly, TrafficShield | Different DNS responses route bots vs humans to different origins. |

### Bot Detection Layers

| Layer | Coverage |
|-------|----------|
| IP Database (known bots, data centers, VPNs) | All 10 companies |
| User-Agent Pattern Matching | All 10 companies |
| JavaScript Execution Check | 8/10 companies |
| Behavioral Fingerprinting (mouse, scroll, timing) | 5/10 (Tier 1-2 only) |
| ML/AI Scoring | 2/10 (Adspect, Traffic Armor) |
| TLS Fingerprinting (JA3/JA4) | 2/10 (TrafficShield, Adspect) |
| Referrer/Header Analysis | All 10 companies |

---

## Comparison to Our System

### What We Have
- **Redirect method:** AB redirect (campaign → meta-refresh → store checkout)
- **Bot detection:** None — we rely on Stripebot seeing a real e-commerce store, not on filtering bots
- **Cloaking mechanism:** Domain isolation — campaign domain is "safe" (donation page), store domain is a real fake e-commerce store
- **Referrer break:** `<meta name="referrer" content="no-referrer">` on the token page

### Key Gaps vs. Top Companies

| Capability | Top Companies | Our System |
|-----------|---------------|-----------|
| Zero-redirect delivery | Yes (PHP proxy, JS injection, edge routing) | No — cross-domain redirect |
| Bot detection | Multi-layer (IP, UA, JS, behavioral, ML) | None — store is "safe" for any visitor |
| Content switching | Same URL serves different content | Different domains serve different content |
| Domain coupling | Single domain (risk: if domain burns, everything burns) | Two domains (campaign burns don't affect store) |
| Stripe compatibility | NOT addressed by any cloaker | Core strength — store is a real e-commerce site |
| Payment processor safety | Not their concern | Our primary concern |

### Why We Can't Just Use a Cloaking Service

1. **Stripe.js telemetry**: If we use a PHP proxy or JS injection to serve our checkout on the campaign domain, Stripe.js reports the campaign domain in telemetry. Our campaign domains are "burned" (previously linked to banned Stripe accounts). This creates an immediate linking signal.

2. **Stripebot**: Stripe's crawler visits the merchant's registered domain. If we proxy through the campaign domain, Stripebot either sees the campaign content (flagged) or we have to UA-cloak Stripebot specifically (instant account kill if detected).

3. **Payment processor ≠ Ad platform**: These cloaking services are designed to fool Meta/Google ad review, not Stripe. Stripe's detection stack is fundamentally different — it uses client-side telemetry (`m.stripe.com`), transaction pattern analysis, and merchant crawler verification.

4. **Our isolation model is stronger**: Two-domain isolation means campaign domain burns have ZERO impact on payment processing. Top cloakers operate on a single domain, meaning any burn affects everything.

---

## Lessons We Can Adopt

Despite not using their core cloaking approach, several techniques are worth adopting:

1. **Preconnect/prefetch from page A to page B** — all top cloakers pre-warm connections
2. **Progress indicators during transitions** — Keitaro and Adspect show loading screens during redirect
3. **Edge-level optimization** — Cloudflare CDN for campaign pages reduces initial load time
4. **Connection warming on intent signals** — prefetch on hover/scroll, not just on page load
