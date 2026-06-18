# Account Isolation & Decommissioning Rotation Checklist

## Overview

When a Stripe account is deactivated (flagged, restricted, or terminated), ALL infrastructure associated with that account must be retired. Stripe's similarity clustering uses **account-level attributes** to link related accounts. If any attribute is shared between a deactivated account and a new one, the new account inherits the risk profile.

This document lists EVERY attribute Stripe tracks and whether it must be rotated on each account decommissioning.

---

## What Stripe Tracks for Cross-Account Linking

Stripe's similarity clustering (2020), the Payments Foundation Model (2025), and the Fraudulent Website Signal LLM (2026 preview) reveal that account linking uses:

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
11. **Apple Pay merchant-domain-association file pspId** — account-bound; same file served on N domains links those N accounts (verified empirically in 2026-05 audit)
12. **HTML/CSS template fingerprint** — the Fraudulent Website Signal LLM evaluates template similarity; identical layout `<head>` across accounts is a high-confidence cluster signal
13. **Price-tuple similarity** — Payments Foundation Model surfaces identical 20+ price vectors across accounts as an embedding-collision pattern

---

## Complete Rotation Checklist

### MUST Rotate on Every Account Decommissioning

| Attribute | Why | How to Rotate |
|-----------|-----|---------------|
| **Stripe account** | Core identity — deactivated account is flagged | Rent a new aged account from a different provider |
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

### MUST NOT Reuse from Deactivated Account

| Attribute | Risk if Reused |
|-----------|---------------|
| Stripe account email | Instant link to deactivated account |
| Bank account for payouts | Strongest linking signal |
| Phone number on Stripe | Direct attribute match |
| Business address on Stripe | Attribute match |
| Tax ID (SSN/EIN) | Identity match (only for self-created accounts) |
| AdsPower profile used for deactivated dashboard | Device fingerprint match |
| IP used to access deactivated dashboard | IP overlap |

### MUST Diverge Across Stores (Enforced in Code — 2026-05 Audit)

| Attribute | Why | Enforcement |
|-----------|-----|-------------|
| **Apple Pay merchant-domain-association file** | Account-bound (pspId is Stripe-issued, 1:1 with account). Identical file across deployments deterministically links the accounts via Stripe's `payment_method_domains` data. | `.gitignore` blocks check-in; `store/server.js` serves via `APPLE_PAY_DOMAIN_ASSOCIATION` env var per deploy. |
| **24-product price vector** | Identical price tuple across 5 MCC-5734 accounts is an embedding-collision signal for the Payments Foundation Model. | `store/scripts/generate-prices.js` — deterministic per-store unique 24-price vector seeded from store ID. |
| **HTML/CSS layout fingerprint** | LLM Fraudulent Website Signal explicitly targets "fake storefronts" with identical rendered head/style blocks. | `store/lib/layout-fingerprint.js` — 5 distinct variants with different CSS var names, nav classes, body class, header class, transition, font stack, structural CSS. Adding a store requires a new `VARIANTS` entry. |
| **PaymentIntent metadata key names** | Cross-store metadata-shape similarity. | Each store picks unique `metadataKeys` in its `config.js`; cross-check by hand against every other store's `config.js`. |
| **Logger startup banner** | Any operator-identifying string leaked to logs / Stripe support tickets / Railway exports links the deployments. | `store/lib/logger.js` reads brand from `storeName` param. `store/scripts/sterility-check.js` blocks restricted literals at `prestart`. |

### Safe to Reuse (NO rotation needed)

| Attribute | Why Safe |
|-----------|---------|
| **`checkout.js` / `cart.js`** | Standard Stripe integration code, identical to millions of Stripe integrations. Script bodies don't fingerprint sites at Stripe's evaluation layer. |
| **`decompose.js` logic** | Server-side, invisible to Stripe |
| **Tailwind CSS via CDN** | CSS framework used by millions of sites |
| **Inter font via Google Fonts** | Used by millions of websites |
| **Page structure** (header, nav, footer skeleton) | Universal e-commerce pattern. Per-store content (links, copy, logo SVG) must still differ. |
| **Number of pages** | Common pattern |
| **Supabase database** | Server-side, invisible to Stripe |
| **Railway hosting IP block** | Cloud IPs shared by millions of sites; low individual signal |
| **Campaign server URLs** | Never visible to Stripe (referrer broken by meta-refresh) |
| **`CALLBACK_SECRET`** structure | Server-to-server, invisible to Stripe — but the literal string MUST be unique per deploy and MUST NOT contain restricted terms |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Server-side only |
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

## Decommission & Replace Process

### Step 1: Decommission the Old Account
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
- Never transfer the domain from the deactivated account to the new one
- Never reference the deactivated store in any new account metadata
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
| IP masking | NodeMaven residential | 1 dedicated IP per profile, rotate on deactivation |
| Email | ProtonMail / Tutanota | Unique email per Stripe account |
| 2FA | Authenticator app | Separate entry per account |
| Payouts | Bank from account owner | Managed by account provider |
| Domain | Any registrar | New domain per store, different registrar is a bonus |
| Hosting | Railway | Separate service per store |
| Database | Supabase | Shared (invisible to Stripe) |
| Code | Git repo | Shared (template structure is safe) |
| Build artifacts | `package-lock.json` | Regenerate after any package.json name change |
| Fulfillment keys | `config.js` metadataKeys | Unique fulfillmentStatus/fulfilledAt/deliveryMethod per store |
| Apple Pay file | `APPLE_PAY_DOMAIN_ASSOCIATION` env var | One per Stripe account; never check in; never share across deployments |
| Layout fingerprint | `store/lib/layout-fingerprint.js` `VARIANTS` | One variant per store; add new variant when adding a 6th+ store |
| Price vector | `store/scripts/generate-prices.js` | Per-store deterministic vector; re-run after `config.js` product changes |
| Pre-deploy gate | `store/scripts/sterility-check.js` | `prestart` hook; fails boot on operator-identifying literals |

---

## Related Reading

- `CLUSTERING-AUDIT-2026-05.md` — full audit that produced the "MUST Diverge Across Stores" table above
- `STRIPE-INVIGILATION.md` — what Stripe can actually see from the wire vs what's internal
- `ROTATION-PLAYBOOK.md` — operational sequence for decommission → replace
