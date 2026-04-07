# Strategy & Handoff Document

## The Problem

We run donation campaigns in multiple languages (Greek, Italian, Spanish, Portuguese, Polish, French) collecting payments from donors. Standard donation payment processors charge high fees, impose restrictions, and may freeze funds. Stripe offers the best rates and UX but classifies unregistered charitable solicitation as a prohibited business.

## The Solution

A two-domain payment cloaking architecture that disguises donation payments as legitimate e-commerce transactions:

1. **Campaign servers** (one per language) host the donation landing pages and never touch Stripe
2. **Store server** (multi-tenant, one per fake e-commerce store) processes payments through Stripe using the store's own Stripe account
3. Donors are redirected from campaign → store, where they see a minimal checkout form with decomposed "product" line items
4. After payment, donors are redirected back to the campaign with a thank-you overlay

Each store is a fully-rendered e-commerce website with 24+ products, search, reviews, cart, about/terms/privacy/FAQ pages, and a functional checkout for non-donors (e.g., Stripebot crawlers or manual reviewers). The stores are entirely fake — no real products are sold.

## Architecture Diagram

```
Donor → campaign.risehope.online (select amount, e.g., €50)
  ↓
POST /api/init-donation → Supabase: create checkout_session, round-robin select store
  ↓
302 redirect → store-abc.com/s/TOKEN
  ↓
GET /s/TOKEN: validate token, set httpOnly cookie, meta-refresh redirect (breaks referrer)
  ↓
GET /checkout: detect __session cookie → render donor checkout (minimal card form)
  ↓
Stripe PaymentElement mounts after 1.2s delay
  ↓
POST /api/create-payment: decompose into product line items, create PaymentIntent with L2/L3 data
  ↓
payment succeeds → POST /api/confirm-payment
  ↓
Create/find Stripe Customer, attach to PI, set receipt_email, add fulfillment metadata
  ↓
Save to Supabase, callback to campaign server, redirect → campaign?status=complete
  ↓
Campaign: show thank-you overlay with share buttons, fire CAPI tracking events
```

## Tech Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| Campaign server | Node.js + Express.js | One Railway deployment per language |
| Store server | Node.js + Express.js + EJS | One Railway deployment per store |
| Styling | Tailwind CSS (CDN) | No build step required |
| Database | Supabase (PostgreSQL) | Central DB shared by all campaigns and stores |
| Payment processing | Stripe PaymentIntents API | Separate Stripe account per store, pinned to `2025-03-31.basil` |
| Hosting | Railway | Separate services for isolation |
| DNS | Per-domain provider | Each store has its own domain |
| Dashboard access | AdsPower + NodeMaven | Anti-detect browser with residential IPs |

## Database Schema (Supabase)

Project ID: `wzialsfdguuircomaqvp` ("DB for Projects")

### Tables

| Table | Purpose |
|-------|---------|
| `stores` | Store registry (domain, slug, name, status, last_used, monthly volume, etc.) |
| `checkout_sessions` | Session tokens linking campaign → store (amount, currency, language, tracking) |
| `payments` | Completed payments with full details (amount, fees, card info, tracking) |
| `customers` | Unique customers by email (name, initials, totals, country) |
| `payment_failures` | Failed payment attempts for debugging |

### Key Functions

| Function | Purpose |
|----------|---------|
| `get_next_store()` | Round-robin store selection (returns next active store, updates `last_used`) |
| Customer totals trigger | Auto-updates `total_donated`, `donation_count` on customers table |
| Store stats trigger | Auto-updates `monthly_volume`, `total_volume` on stores table |

## What Works (Proven Strategies)

1. **Meta-refresh redirect** at `/s/:token` with `<meta name="referrer" content="no-referrer">` — completely breaks the campaign→store referrer chain
2. **httpOnly cookies** for session data — Stripe.js cannot read them, no donation context exposed
3. **Store-specific PaymentIntent metadata key names** — prevents cross-store similarity detection
4. **L2/L3 enhanced line items** — makes transactions look like legitimate e-commerce with `unit_of_measure: 'ACT'`
5. **Fulfillment metadata** post-payment — marks orders as "delivered/digital_download"
6. **Stripe Customer objects** — created post-payment using billing email from charge, then attached to PaymentIntent
7. **`receipt_email`** — set post-payment using the email from charge billing details
8. **`strict-origin-when-cross-origin` referrer policy** — matches browser default for e-commerce
9. **`automatic_payment_methods`** with `allow_redirects: 'never'` — enables card, Apple Pay, Google Pay
10. **Link disabled via API** — `payment_method_options.link.display_preference.preference: 'off'` prevents confusing "save info" UX
11. **Random order reference** — `refCode` derived from session ID + random hex, zero campaign context
12. **Pinned API version** `2025-03-31.basil` — ensures consistent behavior and L2/L3 support
13. **Payment reassurance section** — "Your payment is protected" with SSL/encryption info on checkout
14. **Scrollable checkout** — `min-height: 100%` instead of `overflow: hidden`, no content cropping
15. **Exact arithmetic decomposition** — line item sum always equals PaymentIntent amount (no micro-variance)
16. **Irregular product prices** — $4.97, $6.99, $8.49 instead of round numbers

## What Failed (Don't Repeat)

| Approach | Why It Failed | How Discovered |
|----------|--------------|----------------|
| **Micro-variance on decomposed prices** | Stripe silently drops ALL L2/L3 data when line item sum ≠ PaymentIntent amount | API changelog research (2026-01-28 strict arithmetic validation) |
| **`Referrer-Policy: no-referrer` globally** | Unusual for e-commerce sites. Browser default is `strict-origin-when-cross-origin`. Could itself be a detection signal. | web.dev research + NOC.org analysis |
| **`?donated=true` redirect parameter** | Reveals donation context in the URL. Changed to `?status=complete`. | Code review |
| **Manual `payment_method_types: ['card', 'link']`** | Limits available payment methods. `automatic_payment_methods` lets Dashboard manage methods and enables wallets. | Stripe docs research |
| **`automatic_payment_methods` without `allow_redirects: 'never'`** | Redirect-based methods (iDEAL, Bancontact) were included but client uses `redirect: 'if_required'` with no `return_url` — payment would ERROR if selected | Stripe changelog + Stack Overflow research |
| **Gift card line item fallback** | When decomposition couldn't match exact amounts, a "Gift Card" line item was generated. Removed — remainder is absorbed into existing item prices. | Code review |
| **Missing `unit_of_measure` on line items** | Only qualified for L2 rates, not L3/Product 3. Added `unit_of_measure: 'ACT'` per Stripe docs. | Stripe payment line items docs |
| **Assumption: different HTML/CSS template per store** | Template structure does NOT need to differ. Stripe compares semantic content (product names, descriptions), not HTML/CSS. Millions of Shopify/SamCart merchants share identical templates. | Stripe similarity clustering blog + Shopify/SamCart analysis |
| **Assumption: different color scheme per store** | Color scheme does NOT need to differ. CSS colors are framework-level, invisible to Stripe's content analysis. All stores now use campaign green (#00b964) for seamless redirect UX. | Extension of template sharing analysis |
| **`fields.billingDetails.address.country: 'never'`** | Setting country to 'never' in PaymentElement requires manually passing country in confirmParams, otherwise throws IntegrationError. Removed — let Stripe handle country field natively. | Stripe test transaction |
| **Pre-payment Customer creation** | Creating Stripe Customer before payment meant no email was available yet (donor enters email in Stripe Elements). Moved to post-payment using `charge.billing_details.email`. | Stripe API inspection |
| **`order_ref` derived from campaign slug** | The `refCode` contained campaign slug substring (e.g., "LEUK"). Changed to session ID + random hex. | Stripe Dashboard inspection |
| **Link payment method enabled** | Link's "Save my information" auto-expands when card is filled, cropping checkout content. Disabled via `payment_method_options.link.display_preference.preference: 'off'`. | User testing |
| **Rebilling / noshipping model considered** | Analyzed in depth. Fatal problems: 30-60% SCA decline rate on off-session rebills in Europe, Stripe freezes funds within 24-72hrs of TC40 spike, velocity detection blocks bulk rebills, VAMP instant violation. Donation model vastly superior. | Deep research (BHW, Stripe docs, Visa VAMP rules) |
| **ResizeObserver for auto-scrolling on Link expand** | Added to scroll the submit button into view when Link expanded. Unnecessary once Link was disabled entirely. | Reverted after Link disable |
| **`amount_details.tax.total_tax_amount` at PI level + per-line-item** | Cannot specify both — Stripe returns 400 error. Removed PI-level tax, kept per-line-item tax at 0. | Stripe test transaction error |

## Operational Playbook

### Adding a New Store
See `docs/ROTATION-PLAYBOOK.md` for step-by-step instructions.

### MCC Compatibility
When renting a Stripe account, verify its MCC matches digital products (5734, 5817, 5818, 5964, 5969, 5942). Reject accounts with physical goods MCCs. See `docs/RESEARCH.md` for the full compatibility table.

### Traffic / Behavioral Signals
Run $5/day in ads pointing to each store's homepage. This creates genuine browsing sessions that improve Stripe.js behavioral baselines and prevent every session from looking like direct-to-checkout bot traffic.

### Volume Management
- Distribute volume evenly across active stores
- Respect `max_monthly_volume` per store in Supabase
- Scale gradually: start at 20% capacity, increase 10-15% weekly
- Never spike more than 2x previous week's volume

### Chargeback Prevention
- Donors understand they are donating — chargebacks not expected
- Monitor weekly: must stay below 0.5% (ideally 0%)
- If a dispute appears, burn the store immediately (see Burn Process)

### Dashboard Access
- Use AdsPower with NodeMaven residential IPs
- One separate browser profile per Stripe account
- Never access multiple accounts from the same profile
- Set 2FA with separate authenticator entries

## Future Goals

1. Scale to 5+ active stores with 3+ campaigns
2. Add more campaign languages (German, Dutch, Romanian)
3. Implement store config from Supabase DB instead of file-based `config.js`
4. ~~Build admin tooling for one-click store creation~~ DONE: Admin dashboard supports full store CRUD (add, edit, toggle status, remove) with per-store revenue analytics and volume cap monitoring
5. Add monitoring/alerting for chargeback spikes and payment failure rate increases
6. Consider Cloudflare for edge caching and DDoS protection (optional, not critical)

## Estimates

| Metric | Estimate |
|--------|----------|
| Store setup time | 2-4 hours (domain + Stripe + Railway + content) |
| Warm-up period | 2-4 weeks per store |
| Expected store lifetime | 12-24 months (with zero chargebacks) |
| Stores needed per year | 3 active + 1 warming + 1-2 replacements |
| Monthly capacity per store | $5,000-$15,000 (depending on MCC and age) |

## Project Structure

```
Reserch another/
├── campaign/               # Campaign server (one deployment per language)
│   ├── server.js           # Express server
│   ├── lib/                # Supabase client, helpers
│   ├── public/             # Static assets, JS, CSS
│   └── campaigns/          # Per-language campaign JSON configs
├── store/                  # Store server (one deployment per store)
│   ├── server.js           # Express server (multi-tenant via STORE_ID env)
│   ├── lib/
│   │   ├── decompose.js    # Amount → product line items decomposition
│   │   ├── store-config.js # Loads store config from file
│   │   └── supabase.js     # Supabase client
│   └── stores/
│       ├── zenflow-tools/  # Example store
│       │   ├── config.js   # Products, metadata keys, branding
│       │   ├── public/js/  # checkout.js, cart.js
│       │   └── views/      # EJS templates (10+ pages)
│       └── nova-essentials/ # Another store
├── docs/
│   ├── STRATEGY.md         # This file — master handoff document
│   ├── RESEARCH.md         # Stripe detection research, vulnerabilities, sources
│   ├── ARCHITECTURE.md     # Technical architecture, data flow, what Stripe sees
│   ├── ROTATION-PLAYBOOK.md # Step-by-step store management guide
│   ├── STORE-CONFIG.md     # Store configuration schema and guidelines
│   ├── ACCOUNT-ISOLATION.md # Per-account infrastructure isolation & burn rotation checklist
│   ├── TESTING-GUIDE.md    # Sterility verification & testing procedures
│   └── ROTATION-GUIDE.md   # Extreme in-depth guide on rotating everything
└── .cursor/
    └── rules/
        └── gfm-cloaked.mdc # AI agent rules for this project
```

## Reading Order for Any AI Agent

If you're an AI agent picking this project up, read in this order:

| Order | File | What You'll Learn |
|-------|------|-------------------|
| 1 | `.cursor/rules/gfm-cloaked.mdc` | Critical rules about what to NEVER do |
| 2 | `docs/STRATEGY.md` (this file) | Full project overview, what works, what failed |
| 3 | `docs/RESEARCH.md` | Stripe's detection stack, vulnerability assessment, sources |
| 4 | `docs/ARCHITECTURE.md` | Technical architecture, data flow, what Stripe sees vs doesn't see |
| 5 | `docs/ACCOUNT-ISOLATION.md` | What must rotate on each account burn, infrastructure map |
| 6 | `docs/ROTATION-GUIDE.md` | Extreme in-depth rotation guide (bank, proxy, email, adspower, everything) |
| 7 | `docs/ROTATION-PLAYBOOK.md` | Step-by-step guide for adding, warming, burning stores |
| 8 | `docs/STORE-CONFIG.md` | Store configuration schema, metadata keys, product guidelines |
| 9 | `docs/TESTING-GUIDE.md` | How to verify sterility after deployment |

## Critical Rules for Any AI Agent

1. The "Failed Approaches" section above lists things that were tried and broke — don't repeat them
2. Any code that touches Stripe must use e-commerce terminology, NEVER donation terms
3. The `decompose.js` arithmetic MUST produce an exact match to the PaymentIntent amount
4. New stores need unique product names, metadata keys, and about text (similarity clustering detection)
5. HTML/CSS template structure and color scheme CAN be shared between stores (only semantic content must differ)
6. L2/L3 line items require Stripe API version ≥ 2025-04-30.preview (our pinned version qualifies)
7. `automatic_payment_methods` MUST include `allow_redirects: 'never'` (client has no `return_url`)
8. EVERY PaymentIntent needs: `payment_details.order_reference`, per-item `tax.total_tax_amount: 0`, `unit_of_measure: 'ACT'` on line items
9. Stripe Customer creation happens POST-payment using billing email from charge, not pre-payment
10. `receipt_email` is set POST-payment, not at PaymentIntent creation time
11. Link must be disabled via `payment_method_options.link.display_preference.preference: 'off'`
12. `CALLBACK_SECRET` and `package.json` name must be generic (no "gfm", "cloaked", "donation")
13. The `refCode` (order reference) must NOT contain any campaign slug — use session ID + random hex

## Paytree Comparison

We investigated Paytree.tech, a commercial cloaking service. Key differences:

| Feature | Paytree | Our System |
|---------|---------|-----------|
| Pricing | $950/month per account | Self-hosted, no recurring cost |
| Approach | SaaS middleman, proxied Stripe calls | Direct Stripe integration, full control |
| Store quality | Template-based, limited customization | 24+ products, search, reviews, cart, full e-commerce |
| L2/L3 data | Unknown | Full line items with exact arithmetic |
| Fulfillment evidence | Unknown | Delivered + digital_download post-payment |
| Customer objects | Unknown | Created post-payment with email |
| Metadata customization | Per-account but managed by Paytree | Full control over key names per store |
| Infrastructure isolation | Managed by Paytree | Full control (AdsPower, NodeMaven, separate everything) |
| Code access | Black box | Full source code, fully auditable |

Our system provides deeper Stripe API integration and more control at zero recurring cost.

## Risks and Prevention

### Build Artifacts
- `package-lock.json` inherits the `name` field from `package.json` at generation time. If `package.json` ever contained project-specific names (e.g., "gfm-cloaked-store"), the lockfile retains that name even after `package.json` is cleaned. Always regenerate lockfiles (`rm package-lock.json && npm install`) after changing `package.json` name fields.
- Any file deployed to the server filesystem is a potential leak surface even if not served publicly. Ensure no file in the deployed directory contains "gfm", "cloaked", "donation", or "campaign" in its content.

### Metadata Key Aliasing
- ALL metadata keys sent to Stripe must be aliased per store via `config.js` `metadataKeys`. This includes fulfillment metadata (fulfillment_status, fulfilled_at, delivery_method) which are updated post-payment. Identical key names across stores are a similarity clustering signal.
- Each store's fulfillment keys should match its MCC/product context (e.g., "file_status" for a digital art store, "order_state" for a tools store).

### CAPI Deduplication
- The Purchase event must fire BOTH as a browser pixel event AND a server-side CAPI event using the SAME `event_id`. Without matching IDs, Meta cannot deduplicate and will either double-count or miss conversions.
- The `event_id` is generated on the campaign client before redirect, stored in `sessionStorage`, passed through the checkout flow via the tracking object, and used by both the server-side CAPI (via callback) and the browser pixel (on donor return).

### General Prevention
- Run the sterility checklist in `TESTING-GUIDE.md` after every new store deployment AND after every code change.
- Grep the entire deployed directory for prohibited terms before going live.
- Review `package-lock.json` name fields after every `npm install`.
