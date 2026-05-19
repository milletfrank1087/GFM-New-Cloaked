# CLOAKING-LANDSCAPE.md

Competitive scan of cloaking vendors, in two categories: ad cloakers (fool Meta / Google ad reviewers) and payment cloakers (fool Stripe / PayPal). Merged from the prior `CLOAKING-COMPANIES.md` (ad) and `PAYMENT-CLOAKING-SERVICES.md` (payment) — same conclusion: we built it better and the off-the-shelf services don't solve our actual problem (Stripe.js telemetry + Stripebot).

Cross-reference: `DECISION-LOG.md` records the same conclusion from a different angle (rejected approaches), and `CLOAKING-RESEARCH.md` has the deep zero-redirect proxy analysis.

---

## Category A — Ad Cloakers (Top 10)

These services exist to bypass ad-platform review (Meta, Google Ads). They use server-side content switching, JS injection, edge routing, or PHP includes to show "safe pages" to reviewers and money pages to real visitors.

### Tier 1: Enterprise-Grade (Full Stack)

**1. Keitaro (keitaro.io)** — Self-hosted PHP tracker. IP DB (130M+), UA matching, JS challenges, behavioral fingerprinting. Zero-redirect via `file_get_contents()` / cURL. Full TDS, split-testing, multi-offer rotation. $99+/month.

**2. Adspect (adspect.ai)** — PHP/JS snippet or reverse proxy. ML/AI scoring engine, IP reputation, device fingerprinting. Reverse proxy mode serves both safe + money pages from same URL. Claims ML model trained on billions of visits. $149+/month.

**3. Traffic Armor (trafficarmor.com)** — API-based, JS pixel + server-side verification. IP scoring API, device fingerprinting, behavioral analysis, ISP/ASN classification. <50ms response, used by major affiliate networks. Per-click pricing.

### Tier 2: Purpose-Built Cloakers

**4. HideClick (hideclick.me)** — PHP include on landing page. IP DBs, UA patterns, JS execution checks, timing analysis. PHP server-side content switching. Built for affiliate/media-buy. $145+/month.

**5. Cloakerly (cloakerly.com)** — JS snippet + DNS-level routing. Multi-layer detection. DNS-level split or `document.write()` injection. Focuses on Google Ads + Meta compliance evasion. $99+/month.

**6. TrafficShield** — Cloudflare Worker / edge function. IP reputation, TLS fingerprinting, behavioral scoring. Edge-level content switching, sub-5ms decision latency.

### Tier 3: Simpler/Newer

**7. Cloaking.house** — JS tag or PHP include. IP DBs, UA matching, basic JS challenges. Client-side JS replaces page via `document.write()` or DOM. Targets beginners. $49+/month.

**8. JustCloakIt (justcloakit.com)** — URL-based redirect or JS injection. IP DBs, referrer analysis, geo-filtering. Quick setup. $69+/month.

**9. ZeroCloak** — PHP reverse proxy. IP + UA + JS execution. Full PHP proxy fetches money page server-side. $79+/month.

**10. CloakTrack** — Tracking link + redirect or JS. IP DBs, click-fraud detection, device fingerprinting. Combines cloaking with conversion tracking. $59+/month.

### How they achieve zero-redirect

| Method | Companies | How it works |
|---|---|---|
| PHP server-side include | Keitaro, HideClick, ZeroCloak | Server fetches money page via cURL, serves HTML. URL never changes. |
| Reverse proxy | Adspect, TrafficShield | Edge/server proxies entire request to money-page origin. |
| JS injection | Cloakerly, Cloaking.house, JustCloakIt | `document.write()` / DOM replacement client-side. |
| API decision + conditional render | Traffic Armor | API verdict → server renders appropriate content. |
| DNS-level routing | Cloakerly, TrafficShield | Different DNS responses route bots vs humans. |

### Bot-detection layers across the 10

| Layer | Coverage |
|---|---|
| IP database (known bots, datacenters, VPNs) | All 10 |
| User-Agent pattern matching | All 10 |
| JavaScript execution check | 8/10 |
| Behavioral fingerprinting (mouse, scroll, timing) | 5/10 (Tier 1-2 only) |
| ML/AI scoring | 2/10 (Adspect, Traffic Armor) |
| TLS fingerprinting (JA3/JA4) | 2/10 (TrafficShield, Adspect) |
| Referrer/header analysis | All 10 |

---

## Category B — Payment Cloakers (Top 10)

These services exist to hide a high-risk merchant's true nature from Stripe / PayPal / Square. All use some variant of the AB redirect architecture we built ourselves.

### B1: Dedicated Payment Cloak Panels

**1. Muadata (muadata.com)** — SaaS payment cloak panel with AB redirect, crawler guidance, multi-account rotation. Stripe / PayPal / Square / Authorizenet / Airwallex / Shopify Payments. WordPress + WooCommerce + Opencart + Zencart + Shopyy. Round-robin across multiple payment accounts (daily limits, amount caps, priority sorting). Strips product names. $500 (Personal), $1000 (Team). Telegram @tommuadata.

**2. PaymentCloak (paymentcloak.com)** — Nearly identical to Muadata (likely same origin / white-label). PayPal / Stripe / Square. Team plan adds sub-merchant management with order skimming. $600 (Business). Contact @moyidata.

**3. Moyidata (moyidata.com)** — Variant of the same panel ecosystem, focused on replica products. PayPal / Stripe / Square. AB Jump with "multi-layered data redirection." 1000+ replica sites served. Similar tier pricing.

**4. YegKing (yegking.com)** — Sells the payment cloak system as a downloadable product (source code included). PayPal + Stripe. WooCommerce only. "Become a payment gateway provider" pitch. One-time purchase. The only vendor that sells code rather than SaaS access.

**5. Pay2.House / Cloaking.House (cloaking.house)** — Primarily ad cloaking, but heavily marketed alongside payment cloaking via Shopify integration. PHP integration: white page on hosting, real traffic redirects to Shopify store. Deep fingerprint analysis (Canvas, WebGL, AudioContext, fonts, plugins). Trust Score → only "real buyer" profiles reach the offer page. Subscription pricing.

### B2: Payment Orchestration / Rotation (legit, but adjacent)

**6. RVR PAY Rotate (rvrpay.com/rotate)** — Automated merchant-account (MID) rotation platform. NOT a cloak — legitimate orchestration. Customizable rotation (equal volume, target volumes, priority). Real-time monitoring of volume distribution. Account "seasoning." Pricing not publicly listed.

**7. Paytree (paytree.tech)** — Payment orchestration platform with white-label gateway. NOT a cloak — legitimate SaaS for multi-PSP routing. Rule-based engine, failover, round-robin. €500/mo (Growth), €2000/mo (Whitelabel). Their smart routing + failover concept is exactly what our store rotation does, but using it for cloaking would violate ToS.

**8. Corefy (corefy.com)** — Enterprise orchestration with 600+ PSP integrations. Advanced routing rules (geography, BIN, risk score, cost). White-label gateway. Multi-tenant. Enterprise-grade version of Paytree, overkill for us.

### B3: High-Risk Merchant Account Providers (the "go legit" path)

**9. TailoredPay (tailoredpay.com)** — Legitimate high-risk payment gateway provider for WooCommerce. Multiple acquiring bank connections, built-in chargeback tolerance, flexible underwriting. Represents the "go legit" path. Higher fees (3-5% + per-transaction), rolling reserves, detailed KYC. Won't work for unregistered charitable solicitation.

**10. eComCharge / beGateway (begateway.com)** — White-label payment processing software. PCI DSS Level 1. 170+ connectors, smart routing, cascading. iGaming / forex / similar-risk industries. White-label requires a registered PSP business.

---

## Comparison to our system (combined)

| Capability | Off-the-shelf vendors | Our system |
|---|---|---|
| Zero-redirect delivery | Yes (PHP proxy, JS injection, edge routing) | No — cross-domain redirect |
| Bot detection on the campaign side | Multi-layer (IP, UA, JS, behavioral, ML) | None — we don't need it; store is "safe" for any visitor |
| Content switching | Same URL, different content | Different domains, different content |
| Domain isolation | Single-domain (single point of failure) | Two-domain (campaign burns don't affect store) |
| Stripe.js telemetry concerns | NOT addressed by any vendor | Core strength — Stripe.js loads on clean store domain |
| Stripebot compatibility | NOT addressed | Stripebot crawls a real e-commerce site |
| Store quality | Generic minimal "safe sites" | Fully-built 24-product stores with search / reviews / cart / about / FAQ / terms |
| L2/L3 line item submission | None | Yes — `payment_details.order_reference`, fulfillment evidence, `unit_of_measure: 'ACT'` |
| Account rotation | Yes (every vendor) | Yes (Supabase round-robin + monthly volume caps) |
| Crawler guidance | Yes (IP-based crawler detection + steering) | No — but our approach (Stripebot sees a real store) is arguably safer |
| CAPI/pixel tracking | None | Full dual-fire Meta + TikTok CAPI |
| Cost | $500-1000 one-time + per-account, or $99-149/mo | Self-built; only cost is dev time + infra |

## Why we can't just buy one

1. **Stripe.js telemetry**: any "serve checkout on the campaign domain" approach (PHP proxy, JS injection, CF Worker) means Stripe.js loads on our campaign domain. Our campaign domains are burned (previously linked to banned Stripe accounts) — this is an instant link.
2. **Stripebot**: visits the merchant-registered domain. Proxying through the campaign domain either shows Stripebot the campaign (flagged) or requires UA cloaking (instant kill if detected).
3. **Payment processor ≠ ad platform**: ad cloakers are built to fool Meta/Google review, not Stripe. Stripe's stack is fundamentally different (client telemetry via `m.stripe.com`, transaction-pattern analysis, merchant-crawler verification).
4. **Isolation is stronger than cloaking**: two-domain isolation means a campaign burn has zero impact on payments. Single-domain cloakers don't have this.

## What we can adopt from them

1. **Preconnect / prefetch from page A → page B** — all top cloakers pre-warm connections.
2. **Progress indicators during transitions** — Keitaro and Adspect show loading screens during redirect (we do).
3. **Edge-level optimization** — Cloudflare CDN for campaign pages reduces initial load time.
4. **Connection warming on intent signals** — prefetch on hover/scroll, not just on page load.
5. **Configurable rotation rules** — Muadata / RVR PAY offer per-account daily caps, amount limits, priority sorting. Our `max_monthly_volume` is the start; we could add per-store daily caps and amount-bucket targeting next.

## Sources

- Ad-cloaker pages: keitaro.io, adspect.ai, trafficarmor.com, hideclick.me, cloakerly.com, trafficshield.* , cloaking.house, justcloakit.com, zerocloak.*, cloaktrack.*
- Payment-cloaker pages: muadata.com, paymentcloak.com, moyidata.com, yegking.com, cloaking.house, rvrpay.com/rotate, paytree.tech, begateway.com, corefy.com, tailoredpay.com
- Industry analysis: BlackHatWorld thread "How to Cloak Payment Gateway" (multi-page, 2022-2025), dodopayments.com/blogs ("Best Payment Orchestration Platforms in 2026"), fungies.io ("10 Best Payment Orchestration Platforms for SaaS in 2026"), cloaking.house/blogs (Shopify integration guide, fingerprinting article, March 2026)
