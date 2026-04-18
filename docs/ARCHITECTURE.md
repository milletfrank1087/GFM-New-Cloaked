# Architecture

## System Overview

Two-domain architecture where donation campaigns redirect payment to rotating fake e-commerce stores. Each store has its own payment processor account (Stripe **or** PayPal), domain, and branding. **Exactly one** processor is configured per store. Campaign round-robin store selection is processor-agnostic: any active store may be chosen regardless of whether it uses Stripe or PayPal. The campaign server never calls Stripe or PayPal APIs directly.

## Components

### Campaign Server (`campaign/`)
- Express.js on Railway (1 per language: el.risehope.online, it.risehope.online, etc.)
- Serves donation landing pages with pixel tracking (Meta + TikTok)
- Creates checkout sessions in Supabase and redirects donors to stores
- Receives payment callbacks from stores for CAPI tracking
- Admin dashboard for customers, transactions, analytics, store management (add, edit, toggle status, remove)

### Store Server (`store/`)
- Express.js + EJS on Railway (1 deployment per store for full isolation)
- Loads store config from `store/stores/{STORE_ID}/config.js`
- Handles payments via the processor declared in store config (`paymentProcessor`: `stripe` or `paypal`) using per-store credentials from `.env`
- 10+ pages (home, catalog, product, search, about, contact, terms, privacy, FAQ, cart, checkout)
- Conditional checkout: donors see minimal form, Stripebot/reviewers see full store checkout
- Functional cart system with localStorage
- Product search via `/search?q=`
- Customer reviews on product pages

### Supabase (Central DB)
- Project ID: `wzialsfdguuircomaqvp`
- Tables: `stores`, `checkout_sessions`, `payments`, `customers`, `payment_failures`
- Triggers auto-update customer totals and store stats
- RPC functions for round-robin store selection (`get_next_store`), per-store analytics (`get_store_analytics`)
- Column names sanitized (no donation terminology)

## Data Flow

```
Donor -> Campaign (select amount) -> POST /api/init-donation
  -> Supabase: create checkout_session + round-robin select store
  -> 302 redirect to store-xyz.com/s/TOKEN

Store -> GET /s/TOKEN: validate, claim, set httpOnly __session cookie
  -> meta-refresh redirect to /checkout (breaks referrer chain)
  -> GET /checkout: __session cookie = donor checkout, no cookie = full store
  -> Stripe PaymentElement mounts immediately (no artificial delay)
  -> POST /api/create-payment:
      - Decompose amount into product line items (exact match uses donor amount, not product price)
      - Create PaymentIntent with L2/L3 line items, payment_details.order_reference
      - automatic_payment_methods enabled (card, Apple Pay, Google Pay, etc.)
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

## Multi-Processor Payment Support

Stores are isolated by deployment and credentials. **One processor per store** keeps PCI scope, telemetry, and dashboard access cleanly separated. Supabase still holds a single `checkout_sessions` / payments model; the store that claims a session runs the appropriate integration.

### PayPal Data Flow

```
Donor -> Campaign (select amount) -> POST /api/init-donation
  -> Supabase: create checkout_session + round-robin select store (any processor)
  -> 302 redirect to store-xyz.com/s/TOKEN

Store -> GET /s/TOKEN: validate, claim, set httpOnly __session cookie
  -> meta-refresh redirect to /checkout (breaks referrer chain)
  -> GET /checkout: __session = donor checkout, no cookie = full store
  -> Conditional SDK load: PayPal JS SDK only when paymentProcessor is paypal
  -> Create PayPal order (server): decompose amount into purchase_unit line items
  -> Client: PayPal Card Fields and/or PayPal button (Advanced Checkout)
  -> Payer approves / captures -> PayPal API capture
  -> Server: verify capture, record payment in Supabase (sanitized fields)
  -> Callback to campaign server (same pattern as Stripe path)
  -> Clear __session cookie
  -> Redirect to campaign?status=complete

Store -> PayPal webhooks (where implemented): payment capture/compliance events
```

The campaign never chooses “Stripe vs PayPal”; it only picks a **store**. That store’s config and env determine which APIs run.

### What PayPal Sees

| Layer | What it sees |
|-------|-------------|
| PayPal JS SDK / checkout telemetry | Store domain, interaction with hosted card fields or wallet buttons |
| Order create / capture | `purchase_units`, item breakdown, amounts, currency, merchant-defined invoice/custom id fields (must stay e-commerce neutral) |
| Risk / fraud pipelines | IP, device, velocity, linked accounts graph signals (see RESEARCH.md) |
| Manual / automated review | Store URL, business profile, and consistency with live site content |

### PayPal Detection Surface (Summary)

PayPal’s risk stack evaluates a **large feature set** (commonly cited as **500+** data points across sessions, devices, funding instruments, and account history). Practical implications for this architecture:

- **IP-heavy risk**: A large share of automated flags tie to **IP reputation and geo/velocity** (practitioner reporting often cites **~65%** of flags as IP-related). Store dashboards and buyer sessions should use **clean, residential-consistent** access patterns (same playbook as Stripe: AdsPower + residential IP per account).
- **Asset–Account Graph**: PayPal links entities across **shared bank accounts, cards, devices, IPs, and emails**. Reusing payout banks, login devices, or support emails across PayPal Business accounts creates cross-account risk similar to Stripe’s similarity clustering.
- **Conditional SDK loading**: Only stores with `paymentProcessor: 'paypal'` load the PayPal SDK and card-field scripts. Stripe stores do not load PayPal assets, and PayPal stores do not load Stripe.js. This avoids mixed-processor telemetry on a single storefront and keeps each domain’s third-party footprint aligned with its real processor.

### What PayPal Does NOT See (Same Isolation Goals as Stripe)

- The campaign domain (meta-refresh + `no-referrer` on `/s/:token` preserves the same referrer break)
- Checkout session internals in the browser (httpOnly `__session`; not readable by PayPal scripts)
- Other stores’ transactions or the campaign’s round-robin logic
- Server-only donor/campaign terminology that never appears in order payloads or page copy visible to PayPal’s crawlers

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
- Immediate PaymentElement mounting (removed artificial delay for faster checkout)
- Irregular product prices ($4.97, $6.99, $8.49...) break round-number patterns
- Decomposition uses donor's actual amount for exact matches (prevents rounding mismatch with product prices)
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
| Fulfillment metadata | Post-payment update | Aliased per store via `config.js` `metadataKeys` |

## CAPI Tracking Flow

The system uses a dual-fire architecture for Meta Conversions API (CAPI) and TikTok Events API: every conversion event fires both as a browser pixel event and a server-side CAPI event. Meta deduplicates using a shared `event_id`.

### Event Lifecycle on the Campaign Page

```
Page Load → PageView (browser pixel + server CAPI)
Scroll/Interact → ViewContent (browser pixel + server CAPI)
Open Modal → AddToCart (browser pixel + server CAPI)
Confirm Amount → InitiateCheckout (browser pixel + server CAPI)
                  ↓
           Generate Purchase event_id → store in sessionStorage
           Include event_id in tracking object
                  ↓
           Redirect to store (window.location.replace)
```

### Purchase Event Deduplication Flow

```
CAMPAIGN CLIENT (donation.js):
  1. Generate event_id: Tracking.generateEventId('Purchase')
  2. Store in sessionStorage: _purchase_event_id, _purchase_amount, _purchase_currency
  3. Include in tracking object → POST /api/init-donation
                ↓
CAMPAIGN SERVER (server.js /api/init-donation):
  4. Save tracking (incl. eventId) in Supabase checkout_session
                ↓
STORE SERVER (server.js /s/:token):
  5. Read checkout_session → set __session cookie with donor.utm
  6. Payment completes → callback to campaign with tracking.eventId
                ↓
CAMPAIGN SERVER (server.js /api/payment-callback):
  7. Fire server-side CAPI Purchase with tracking.eventId → capture result into JourneyLog
                ↓
CAMPAIGN CLIENT (donation.js handleDonatedReturn):
  8. Donor returns with ?status=complete
  9. Read event_id from sessionStorage
  10. Fire browser pixel Tracking.trackPurchase() with same event_id
  11. Clear sessionStorage
                ↓
META DEDUPLICATION:
  12. Server event (step 7) + browser event (step 10) share event_id
  13. Meta counts as ONE conversion
```

### Tracking Modules

| Module | Location | Purpose |
|--------|----------|---------|
| Browser tracking | `campaign/public/js/tracking.js` | Pixel events, click ID capture (fbp/fbc/ttp/ttclid), event dispatch to server |
| Server tracking | `campaign/lib/tracking.js` | Meta CAPI and TikTok Events API, PII hashing (SHA256), server-to-server dispatch |
| Config endpoint | `GET /api/tracking/config` | Returns pixel IDs and tracking-enabled flag to browser |
| Track endpoint | `POST /api/track` | Receives browser events, fires server-side CAPI for deduplication |
| Payment track | `POST /api/track/payment-event` | Dedicated endpoint for purchase/callback tracking events |

### Environment Variables for Tracking

| Variable | Purpose |
|----------|---------|
| `TRACKING_ENABLED` | Master switch for all tracking (true/false) |
| `FB_PIXEL_ID` | Meta Pixel ID for browser events |
| `FB_ACCESS_TOKEN` | Meta CAPI access token for server events |
| `TIKTOK_PIXEL_ID` | TikTok Pixel ID for browser events |
| `TIKTOK_ACCESS_TOKEN` | TikTok Events API access token for server events |

See `TRACKING.md` for the full tracking architecture reference.

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
| `TRACKING.md` | Full CAPI tracking architecture, deduplication, and debugging |
| `CLOAKING-RESEARCH.md` | Zero-redirect cloaking research: CF Worker reverse proxy approach, alternatives, risks |
| `ISSUES-AND-FIXES.md` | All bugs found during April 2026 audit and their fixes |
| `CPA-ANALYSIS.md` | Full CPA investigation, funnel metrics, and projections |
| `CLOAKING-COMPANIES.md` | Top 10 cloaking companies reverse-engineered and compared |
| `REDIRECT-OPTIMIZATION.md` | Complete redirect friction reduction playbook |
| `DECISION-LOG.md` | All approaches evaluated with verdicts and reasoning |
| `PAYMENT-CLOAKING-SERVICES.md` | Top 10 payment cloaking/orchestration services reverse-engineered |
