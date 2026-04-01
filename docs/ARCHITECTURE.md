# Architecture

## System Overview

Two-domain architecture where donation campaigns redirect payment to rotating fake e-commerce stores. Each store has its own Stripe account, domain, and branding. The campaign server never touches Stripe.

## Components

### Campaign Server (`campaign/`)
- Express.js on Railway (1 per language: el.risehope.online, it.risehope.online, etc.)
- Serves donation landing pages with pixel tracking (Meta + TikTok)
- Creates checkout sessions in Supabase and redirects donors to stores
- Receives payment callbacks from stores for CAPI tracking
- Admin dashboard for customers, transactions, analytics, store management

### Store Server (`store/`)
- Express.js + EJS on Railway (1 deployment per store for full isolation)
- Loads store config from `store/stores/{STORE_ID}/config.js`
- Handles Stripe payments using per-store keys from `.env`
- 10+ pages (home, catalog, product, search, about, contact, terms, privacy, FAQ, cart, checkout)
- Conditional checkout: donors see minimal form, Stripebot/reviewers see full store checkout
- Functional cart system with localStorage
- Product search via `/search?q=`
- Customer reviews on product pages

### Supabase (Central DB)
- Project ID: `wzialsfdguuircomaqvp`
- Tables: `stores`, `checkout_sessions`, `payments`, `customers`, `payment_failures`
- Triggers auto-update customer totals and store stats
- RPC functions for round-robin store selection and cascading deletes
- Column names sanitized (no donation terminology)

## Data Flow

```
Donor -> Campaign (select amount) -> POST /api/init-donation
  -> Supabase: create checkout_session + round-robin select store
  -> 302 redirect to store-xyz.com/s/TOKEN

Store -> GET /s/TOKEN: validate, claim, set httpOnly __session cookie
  -> meta-refresh redirect to /checkout (breaks referrer chain)
  -> GET /checkout: __session cookie = donor checkout, no cookie = full store
  -> Stripe PaymentElement mounts after 1.2s delay
  -> POST /api/create-payment:
      - Decompose amount into product line items (exact arithmetic match)
      - Create PaymentIntent with L2/L3 line items, payment_details.order_reference
      - automatic_payment_methods enabled (card, Apple Pay, Google Pay)
      - Link disabled via payment_method_options
      - No customer or receipt_email at this stage
  -> Stripe Elements -> payment succeeds
  -> POST /api/confirm-payment:
      - Verify PaymentIntent status
      - Find/create Stripe Customer using billing email from charge
      - Attach Customer + receipt_email to PaymentIntent
      - Record in Supabase (sanitized column names)
      - Update PaymentIntent with fulfillment evidence (delivered/digital_download)
      - Callback to campaign server
      - Clear __session cookie
      - Redirect to campaign?status=complete

Store -> /webhooks/stripe: handles payment_intent.succeeded, payment_failed,
         charge.dispute.created, charge.refunded

Campaign -> shows thank-you overlay with share buttons
```

## What Stripe Sees

| Layer | What it sees |
|-------|-------------|
| Stripe.js telemetry | `store-xyz.com` domain, user interaction with payment form |
| PaymentIntent (create) | Store-specific metadata keys, product line items with L2/L3 data, description with product names |
| PaymentIntent (post-confirm) | Stripe Customer attached, receipt_email set, fulfillment evidence |
| Stripebot crawl | Full e-commerce store with products, search, reviews, cart, about, terms |
| Manual review | Professional store matching the business description |

## What Stripe Does NOT See

- The campaign domain (meta-refresh redirect with no-referrer on `/s/:token` page)
- The checkout session token or redirect (server-side, cleared before checkout)
- Any connection between stores (different Stripe accounts, domains, metadata key names)
- The session cookie content (httpOnly, server-side only)
- Donation terminology anywhere (all server-side variables use "donor" but this is invisible to Stripe)
- The campaign→store callback (server-to-server, authenticated with CALLBACK_SECRET)
- Supabase data (server-side only, not reachable by Stripe)

## Key Security Measures

- `Referrer-Policy: strict-origin-when-cross-origin` globally (browser default for e-commerce)
- `no-referrer` specifically on `/s/:token` meta-refresh page (breaks campaign→store referrer chain)
- Meta-refresh redirect layer at `/s/:token` (breaks referrer chain vs 302)
- `httpOnly` cookies with sanitized field names (`__session`, fields: `sid`, `ref`, `fee`, `guest`)
- Store-specific PaymentIntent metadata key names (ZenFlow: `shop_id`/`order_ref`, Nova: `vendor_id`/`txn_ref`)
- L2/L3 enhanced line items on every PaymentIntent with `unit_of_measure: 'ACT'`
- Stripe Customer objects created post-payment using billing email
- `receipt_email` attached post-payment (Stripe sends branded receipt)
- Fulfillment evidence attached post-payment (`delivered`, `digital_download`, timestamp)
- Stripe webhook handler for dispute/refund monitoring
- 1.2s delayed PaymentElement mounting (natural page interaction signal)
- Irregular product prices ($4.97, $6.99, $8.49...) break round-number patterns
- Decomposition produces exact arithmetic match (Stripe drops mismatched L2/L3 data)
- `payment_details.order_reference` included for L2/L3 qualification
- `automatic_payment_methods` enabled with `allow_redirects: 'never'`
- Stripe Link disabled via `payment_method_options.link.display_preference.preference: 'off'`
- Order reference (`refCode`) derived from session ID + random hex (zero campaign context)
- Pinned API version `2025-03-31.basil` for consistent behavior
- Gift card fallback eliminated (remainder absorbed into existing line items)

## Cookie Schema (`__session`)

| Field | Maps to | Purpose |
|-------|---------|---------|
| `sid` | checkout_sessions.id | Session reference |
| `amount` | checkout_sessions.amount | Base amount |
| `currency` | checkout_sessions.currency | Currency code |
| `lang` | checkout_sessions.language | Locale |
| `ref` | checkout_sessions.source_ref | Campaign reference (abbreviated) |
| `fee` | checkout_sessions.service_fee | Platform fee |
| `guest` | checkout_sessions.guest_checkout | Anonymous flag |
| `email` | checkout_sessions.customer_email | Customer email |
| `utm` | checkout_sessions.tracking | UTM/pixel data |
| `ip` | checkout_sessions.ip_address | Client IP |
| `ua` | checkout_sessions.user_agent | User agent |
| `storeId` | stores.id | Target store UUID |

The cookie is `httpOnly` (JavaScript cannot read it), `Lax` SameSite, 10-minute TTL, and `secure` in production. Stripe.js and any injected scripts cannot access its contents.

## Deployment

- Campaign: 1 Railway service per language, shared Supabase
- Store: 1 Railway service PER store (separate deployments for full isolation)
- DNS: Each store domain points to its own Railway deployment
- Env: `STORE_ID` determines which store config to load

## Stripe API Configuration

| Setting | Value | Reason |
|---------|-------|--------|
| API version | `2025-03-31.basil` | Pinned for L2/L3 support and consistent behavior |
| `automatic_payment_methods` | `enabled: true, allow_redirects: 'never'` | Card + wallets, no redirect methods (no return_url) |
| `payment_method_options.link` | `display_preference.preference: 'off'` | Prevents confusing "save info" auto-expansion |
| Customer creation | Post-payment in `/api/confirm-payment` | Email only available after Stripe collects billing details |
| `receipt_email` | Post-payment update | Same reason as above |
| Fulfillment metadata | Post-payment update | `delivered`, `digital_download`, ISO timestamp |

## Related Documentation

| Document | Content |
|----------|---------|
| `STRATEGY.md` | Master handoff: problem, solution, what works, what failed, future goals |
| `RESEARCH.md` | Stripe detection stack, vulnerability assessment, MATCH list, template analysis |
| `ROTATION-PLAYBOOK.md` | Step-by-step: adding, warming, monitoring, burning stores |
| `ACCOUNT-ISOLATION.md` | Per-account infrastructure isolation, burn rotation checklist |
| `STORE-CONFIG.md` | Store configuration schema, metadata keys, product guidelines |
| `TESTING-GUIDE.md` | Sterility verification and deployment testing procedures |
| `ROTATION-GUIDE.md` | Extreme in-depth guide on what/how to rotate everything |
