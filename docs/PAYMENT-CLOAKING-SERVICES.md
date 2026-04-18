# Payment Processing Cloaking Services — Market Analysis

## Overview

Unlike ad cloaking services (which fool Meta/Google reviewers), these companies specifically target **payment processor evasion** — hiding the true nature of a high-risk business from Stripe, PayPal, Square, etc. They all use some variant of the AB redirect architecture we built ourselves.

---

## Category 1: Dedicated Payment Cloaking Panels

### 1. Muadata (muadata.com)

- **What:** SaaS payment cloak panel with AB redirect, crawler guidance, multi-account rotation
- **Processors:** Stripe, PayPal, Square, Authorizenet, Airwallex, Shopify Payments
- **Platforms:** WordPress/WooCommerce, Opencart, Zencart, Shopyy
- **Key Features:**
  - AB redirect: Site A (high-risk) → cloak panel → Site B (low-risk) → payment gateway
  - Crawler guidance: Identifies payment gateway crawler IPs and redirects them to Site B product pages
  - Multi-account rotation: Round-robin across multiple payment accounts with configurable rules (daily limits, amount caps, priority sorting)
  - Order information sanitization: Strips product names/descriptions, shows only order numbers
  - Batch management of payment accounts, shipping info upload
- **Pricing:** $500 (Personal), $1000 (Team), reseller program available
- **Market:** Primarily replica/counterfeit goods from China/India
- **Telegram:** @tommuadata

### 2. PaymentCloak (paymentcloak.com)

- **What:** Nearly identical to Muadata — same core technology (likely same origin or white-label)
- **Processors:** PayPal, Stripe, Square
- **Key Features:** Same as Muadata — AB jump, crawler processing, multi-account rotation, order hiding
- **Unique:** Team plan includes sub-user management — you can create sub-merchants and hide a percentage of their orders (skimming)
- **Pricing:** $600 (Business), Team plan available
- **Contact:** @moyidata (Telegram)

### 3. Moyidata (moyidata.com)

- **What:** Another variant of the same cloak panel ecosystem, focused on replica products market
- **Processors:** PayPal, Stripe, Square
- **Key Features:** AB Jump with "multi-layered data redirection," crawler processing, polling switch payments
- **Claims:** 1000+ replica sites served, specifically targets China/India replica market
- **Pricing:** Similar tier to Muadata/PaymentCloak

### 4. YegKing (yegking.com)

- **What:** Sells the payment cloak system as a downloadable product (source code included)
- **Processors:** PayPal, Stripe
- **Platforms:** WooCommerce/WordPress only
- **Key Features:**
  - Provides actual source code — you can self-host and even resell
  - Same AB redirect + rotation mechanics
  - "Become a payment gateway provider" pitch
- **Pricing:** One-time purchase (source code)
- **Unique:** The only service that sells the code itself rather than SaaS access

### 5. Pay2.House / Cloaking.House (cloaking.house)

- **What:** Primarily an ad cloaking service, but heavily marketed alongside payment cloaking via Shopify integration
- **Key Features:**
  - PHP integration for Shopify: White page on hosting, real traffic redirects to Shopify store
  - Deep fingerprint analysis (Canvas, WebGL, AudioContext, fonts, plugins)
  - Trust Score concept — only visitors with "real buyer" profiles reach the offer page
  - Flow management with pause/resume for account warming
- **Relevance:** Not a direct payment cloak but their Shopify + PHP integration guide shows how traffic arbitrageurs use cloaking to protect Shopify payment accounts from ad platform scrutiny
- **Pricing:** Subscription-based

---

## Category 2: Payment Orchestration / Rotation Services

### 6. RVR PAY Rotate (rvrpay.com/rotate)

- **What:** Automated merchant account (MID) rotation platform
- **NOT a cloak** — this is a legitimate orchestration tool for distributing volume across multiple merchant accounts
- **Key Features:**
  - Automated transaction routing across multiple MIDs
  - Customizable rotation logic (equal volume, target volumes, priority)
  - Seamless gateway integration via API
  - Real-time monitoring of volume distribution
  - Account "seasoning" — ensures even usage patterns to avoid reviews
- **Target Market:** High-risk/high-volume merchants managing 2+ merchant accounts
- **Relevance to Us:** Their rotation concept is exactly what our Supabase round-robin store selection does, but productized
- **Pricing:** Not publicly listed

### 7. Paytree (paytree.tech)

- **What:** Payment orchestration platform with white-label gateway
- **NOT a cloak** — legitimate SaaS for multi-PSP routing
- **Key Features:**
  - Connect multiple payment providers via single integration
  - Smart routing: Rule-based engine, automated failover, round-robin balancing
  - White-label: Branded checkout experience with full control
  - Unified analytics across all PSPs
- **Pricing:** €500/month (Growth), €2000/month (Whitelabel)
- **Relevance to Us:** Their smart routing + failover is similar to our store rotation. Could theoretically be used to route between clean stores, but it's a legitimate business — using it for cloaking would violate their ToS

### 8. Corefy (corefy.com)

- **What:** Enterprise payment orchestration with 600+ payment provider integrations
- **Key Features:**
  - Advanced routing rules (geography, card BIN, risk score, cost)
  - White-label gateway capabilities
  - Multi-tenant architecture
- **Relevance:** Enterprise-grade version of what Paytree offers. Overkill for our use case but represents the "legitimate" end of the spectrum

---

## Category 3: High-Risk Merchant Account Providers

### 9. TailoredPay (tailoredpay.com)

- **What:** Legitimate high-risk payment gateway provider for WooCommerce
- **NOT a cloak** — they provide actual merchant accounts for high-risk industries
- **Key Features:**
  - Direct integration with WooCommerce
  - Multiple acquiring bank connections
  - Built-in risk tolerance for chargebacks
  - Flexible underwriting
- **Relevance:** Represents the "go legit" path. Higher fees (typically 3-5% + per-transaction), rolling reserves, and detailed KYC. Would not work for our use case (unregistered charitable solicitation)

### 10. eComCharge / beGateway (begateway.com)

- **What:** White-label payment processing software
- **Key Features:**
  - PCI DSS Level 1 compliant
  - 170+ connectors, smart routing, cascading
  - White-label for PSPs, iGaming, forex
  - Payment splitting, tokenization
- **Relevance:** Their iGaming/forex focus means they serve industries with similar risk profiles. Their white-label approach could theoretically be used to create "clean" payment fronts, but requires a registered PSP business

---

## Comparison to Our System

| Feature | Muadata/PaymentCloak | Our System |
|---------|---------------------|-----------|
| AB Redirect | Panel-managed, PHP-based | Custom Express.js, token-based |
| Store Quality | Generic low-risk sites (minimal) | Fully built e-commerce stores (24+ products, search, reviews, cart) |
| Crawler Handling | IP-based crawler detection + redirect | Real store content — no cloaking needed |
| Account Rotation | Built-in multi-account polling | Supabase round-robin store selection |
| Order Sanitization | Strips product names, shows order # only | L2/L3 line items with real product names |
| Referrer Break | Handled by their panel | `<meta name="referrer" content="no-referrer">` + meta-refresh |
| Payment Methods | Card only (typically) | Card + Apple Pay + Google Pay (automatic_payment_methods) |
| CAPI/Pixel Tracking | Not included | Full dual-fire Meta + TikTok CAPI |
| Cost | $500-1000 one-time + per-account | Self-built (free, but dev time) |

---

## Key Takeaways

1. **Our system is more sophisticated than every dedicated payment cloaker.** Muadata, PaymentCloak, and Moyidata use minimal "low-risk sites" that wouldn't survive deep Stripe manual review. Our stores have 24+ products, functional search, reviews, cart, about/terms/privacy pages.

2. **Our L2/L3 line item decomposition is unique.** No payment cloaker we found does enhanced data submission (Level 2/3 line items, `payment_details.order_reference`, fulfillment evidence). This is a significant advantage for Stripe longevity.

3. **Account rotation is table stakes.** Every service offers multi-account rotation. Our Supabase round-robin does this already but could benefit from the configurable rules (daily caps, amount limits, priority sorting) that Muadata/RVR PAY offer.

4. **Crawler guidance is their differentiator.** The one feature these panels have that we DON'T implement is active payment gateway crawler detection and redirection. However, our approach (Stripebot sees a real store) is arguably safer than IP-based crawler spoofing.

5. **The "legitimate" orchestration path (Paytree, Corefy) won't work for us.** These services require real business registrations and enforce compliance. They're designed for legitimate high-risk merchants, not for disguising transaction origins.

---

## Sources

- muadata.com (pricing, documentation, about, FAQ, how-we-work pages)
- paymentcloak.com (FAQ, product pages, pricing)
- moyidata.com (homepage, features)
- yegking.com (product listing)
- cloaking.house/blogs (Shopify integration guide, fingerprinting article, March 2026)
- rvrpay.com/rotate (product page)
- paytree.tech (homepage, features, pricing)
- begateway.com (guides, features)
- tailoredpay.com (WooCommerce high-risk guide, March 2026)
- BlackHatWorld thread: "How to Cloak Payment Gateway" (multi-page, 2022-2025)
- dodopayments.com/blogs: "Best Payment Orchestration Platforms in 2026"
- fungies.io: "10 Best Payment Orchestration Platforms for SaaS in 2026"
