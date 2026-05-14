# Account Isolation & Burn Rotation Checklist

## Overview

When a Stripe account is burned (flagged, restricted, or terminated), ALL infrastructure associated with that account must be retired. Stripe's similarity clustering uses **account-level attributes** to link related accounts. If any attribute is shared between a burned account and a new one, the new account inherits the risk profile.

This document lists EVERY attribute Stripe tracks and whether it must be rotated on each account burn.

---

## What Stripe Tracks for Cross-Account Linking

Stripe's official similarity clustering blog (2020) and the Payments Foundation Model (2025) reveal that account linking uses:

1. **Bank account numbers** — strongest signal, hardest to fake
2. **Email addresses and domains** — both the account email and pattern
3. **IP addresses** — dashboard login IPs, not server hosting IPs
4. **Device fingerprints** — browser fingerprint from dashboard sessions
5. **Phone numbers** — associated with the account
6. **Physical address** — business address on file
7. **Tax IDs (SSN/EIN)** — identity verification data
8. **Card fingerprints** — if the same card was ever used on the account
9. **Text similarity** — business name, description, product content (semantic, not HTML)
10. **Behavioral patterns** — transaction timing, amounts, frequency

---

## Complete Rotation Checklist

### MUST Rotate on Every Account Burn

| Attribute | Why | How to Rotate |
|-----------|-----|---------------|
| **Stripe account** | Core identity — burned account is flagged | Rent a new aged account from a different provider |
| **Domain name** | Plaintext in Stripe.js telemetry, linked to the account | Buy a new domain (different registrar is a bonus, not required) |
| **AdsPower browser profile** | Device fingerprint for dashboard access | Create a brand new AdsPower profile |
| **Residential proxy/IP** | Dashboard login IP is tracked | Assign a new NodeMaven residential IP to the new profile |
| **Store name & branding** | Text similarity clustering | New name, tagline |
| **Product names & descriptions** | Text similarity clustering (semantic content) | Write new product content (different niche/theme within same MCC) |
| **About page text** | Stripebot crawls and compares | Write new about text |
| **Contact email** | Account attribute matching | New email address, different domain |
| **Statement descriptor** | Visible on bank statements, linked to account | Matches new store name |
| **PaymentIntent metadata key names** | Cross-store pattern detection | Choose entirely new key names (see STORE-CONFIG.md) |
| **Fulfillment metadata keys** | Post-payment keys are also compared by similarity clustering | New aliases for fulfillmentStatus, fulfilledAt, deliveryMethod in config.js |
| **`package-lock.json`** | Retains stale project names from earlier `package.json` | Delete lockfile, run `npm install` to regenerate with clean name |
| **Webhook endpoint URL** | Points to new domain | `https://new-domain.com/webhooks/stripe` |
| **Railway deployment** | Separation of environments | New Railway service |
| **Store `.env` file** | All new keys, domain, etc. | Fresh `.env` with new Stripe keys |

### MUST NOT Reuse from Burned Account

| Attribute | Risk if Reused |
|-----------|---------------|
| Stripe account email | Instant link to burned account |
| Bank account for payouts | Strongest linking signal |
| Phone number on Stripe | Direct attribute match |
| Business address on Stripe | Attribute match |
| Tax ID (SSN/EIN) | Identity match (only for self-created accounts) |
| AdsPower profile used for burned dashboard | Device fingerprint match |
| IP used to access burned dashboard | IP overlap |

### Safe to Reuse (NO rotation needed)

| Attribute | Why Safe |
|-----------|---------|
| **HTML/CSS template code** | Millions of merchants share Shopify/WooCommerce templates. Stripe compares content, not code structure. |
| **Color scheme (CSS)** | CSS is framework-level. Stripe compares text content, not visual design. All stores share the same green palette. |
| **EJS template layout** | Framework-level, not content-level |
| **`checkout.js` / `cart.js`** | Standard Stripe integration code, identical to millions of Stripe integrations |
| **`decompose.js` logic** | Server-side, invisible to Stripe |
| **Tailwind CSS** | CSS framework used by millions |
| **Page structure** (header, nav, footer) | Universal e-commerce pattern |
| **Number of products** (24) | Not a meaningful signal |
| **Number of pages** | Common pattern |
| **Price point coverage range** | Common across e-commerce |
| **Supabase database** | Server-side, invisible to Stripe |
| **Railway hosting IP** | Cloud IPs shared by millions of sites |
| **Campaign server URLs** | Never visible to Stripe (referrer broken by meta-refresh) |
| **`CALLBACK_SECRET`** | Server-to-server, invisible to Stripe |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Server-side only |
| **Font (Inter)** | Used by millions of websites |
| **Checkout UX flow** | Standard e-commerce pattern |

---

## Per-Account Infrastructure Map

For each active Stripe account, maintain this isolation map:

```
Account #1: ZenFlow Tools
├── Stripe: sk_live_xxx / pk_live_xxx (account email: zenflow@proton.me)
├── Domain: zenflow-tools.com (Namecheap)
├── AdsPower Profile: #14 (IP: 45.xxx.xxx.xxx via NodeMaven)
├── Bank: [payout bank details from account owner]
├── Railway Service: store-zenflow
├── Webhook: https://zenflow-tools.com/webhooks/stripe
├── Statement Descriptor: ZENFLOW TOOLS
└── Status: active

Account #2: Nova Essentials
├── Stripe: sk_live_yyy / pk_live_yyy (account email: nova@tutanota.com)
├── Domain: nova-essentials.com (Porkbun)
├── AdsPower Profile: #17 (IP: 91.xxx.xxx.xxx via NodeMaven)
├── Bank: [different payout bank details]
├── Railway Service: store-nova
├── Webhook: https://nova-essentials.com/webhooks/stripe
├── Statement Descriptor: NOVA ESSENTIALS
└── Status: active
```

---

## Burn & Replace Process

### Step 1: Burn the Old Account
1. Set store status to `paused` and `weight_pct = 0` in Supabase (rotation skips it automatically; rebalance the remaining active stores' weights to sum to 100)
2. Do NOT close the Stripe account immediately (let pending charges settle for 30 days)
3. Stop using the AdsPower profile for this account
4. After 30 days, close the Stripe account
5. Let the domain expire or park it

### Step 2: Set Up the New Replacement
1. Rent a new aged Stripe account (check MCC first!)
2. Buy a new domain
3. Create a new AdsPower profile with a fresh NodeMaven IP
4. Create new store directory: `store/stores/{new-id}/`
5. Copy template structure from existing store (safe — code can be identical)
6. Write NEW content: product names, descriptions, about text, reviews
7. Choose NEW metadata key names in `config.js`
8. Create new Railway service, set new `.env`
9. Add to Supabase `stores` table with status `paused` and `weight_pct = 0`
10. Register Apple Pay domain in new Stripe Dashboard
11. Register webhook endpoint in new Stripe Dashboard
12. Warm up: 3-5 small transactions over 1-2 weeks (stays `paused` for warm-up)
13. Set status to `active`, assign `weight_pct`, and rebalance active stores' weights to sum to 100

### Step 3: Never Cross-Contaminate
- Never log into the new dashboard from the old AdsPower profile
- Never use the same residential IP for two different dashboards
- Never transfer the domain from the burned account to the new one
- Never reference the burned store in any new account metadata
- Never use the same bank account for the new Stripe account

---

## MATCH List Awareness

The MATCH (Member Alert to Control High-Risk Merchants) list is a 5-year blacklist shared across ALL payment processors (not just Stripe). Triggers:

| MATCH Reason Code | Description | Risk for Us |
|-------------------|-------------|-------------|
| Code 4 | Excessive chargebacks | **Primary risk** — keep chargebacks at 0% |
| Code 12 | PCI non-compliance | Low — Stripe Elements handles PCI |
| Code 13 | Illegal transactions | Low — donations aren't illegal |
| Code 14 | Identity theft | Medium — only if rented account is flagged |

**Key point**: MATCH only applies to the account owner's identity (SSN/EIN/business), not to the website or domain. Since we rent accounts, the MATCH risk falls on the account provider, not on our infrastructure. However, if an account gets MATCH-listed, we lose that Stripe account permanently.

---

## Operational Security Summary

| Layer | Tool | Rule |
|-------|------|------|
| Dashboard access | AdsPower | 1 profile per Stripe account, never shared |
| IP masking | NodeMaven residential | 1 dedicated IP per profile, rotate on burn |
| Email | ProtonMail / Tutanota | Unique email per Stripe account |
| 2FA | Authenticator app | Separate entry per account |
| Payouts | Bank from account owner | Managed by account provider |
| Domain | Any registrar | New domain per store, different registrar is a bonus |
| Hosting | Railway | Separate service per store |
| Database | Supabase | Shared (invisible to Stripe) |
| Code | Git repo | Shared (template structure is safe) |
| Build artifacts | `package-lock.json` | Regenerate after any package.json name change |
| Fulfillment keys | `config.js` metadataKeys | Unique fulfillmentStatus/fulfilledAt/deliveryMethod per store |
