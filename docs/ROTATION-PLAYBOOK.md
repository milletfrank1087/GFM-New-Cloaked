# Store Rotation Playbook

## Quick Reference — End-to-End New Store Checklist

For agents: this is the execution order. Each step references the detailed section below.

1. **Pick store identity** — slug, display name, niche, domain (buy last)
2. **Layout fingerprint** — add variant to `store/lib/layout-fingerprint.js` (§3 step 2)
3. **Generate prices** — `node store/scripts/generate-prices.js --store=<slug>` (§3 step 3)
4. **Write config.js** — unique metadataKeys, colors, products, currency (§3 step 4)
5. **Scaffold views** — copy from newest store, adapt ALL content + CSS classes (§3 step 5-6)
6. **Sterility check** — `cd store && npm run sterility-check` — must PASS (§3 step 9)
7. **Build artifact cleanup** — delete + regenerate `package-lock.json`, verify clean name (§5)
8. **Supabase row** — insert `paused`, `weight_pct=0` (§4)
9. **Git push** — commit all new files, push to `main`
10. **Railway service** — create via GraphQL API, set all env vars, deploy (§6)
11. **Domain + DNS** — buy domain, run `connect-store-dns.ps1`, update Supabase `domain` (§1 + §6 step 6)
12. **Stripe setup** — webhook, Apple Pay domain, statement descriptor, business URL (§2a)
13. **Warm-up** — 3-7 days test transactions at 0% weight (§9)
14. **Go live** — set `weight_pct > 0`, rebalance active stores to sum 100 (§4)

Railway project ID: `7bb4befa-cbe4-4763-a782-43f1550857cd`, env: `14944148-a284-4f59-a2cc-0b7447138f84`.

---

## Adding a New Store

### 1. Domain Setup

**Canonical host is always `www.<apex>`** — every live store in Supabase uses the `www` subdomain (`www.optimisystems.store`, `www.preciouscouture.online`, etc.), not the bare apex. Railway `STORE_DOMAIN`, the Supabase `stores.domain` column, Stripe `business_profile.url`, and Apple Pay domain registration must all use the same `www.` host.

#### GoDaddy (operator registrar — all store domains)

GoDaddy **cannot CNAME the apex** (`@`). Apex stays on GoDaddy's parked A record or Website Builder. Wire the store on **`www.<domain>` only**.

1. Create the Railway custom domain as `www.<domain>` (not apex). Capture the CNAME target Railway returns (e.g. `8lkrz2r6.up.railway.app`).
2. In GoDaddy DNS (Dashboard or API via `operator/godaddy-dns.ps1`):
   - **CNAME** `www` → `<railway-cname-target>` (TTL 1800)
   - **TXT** `_railway-verify` → `railway-verify=<token>` (if Railway shows one)
   - **TXT** `_railway-verify.www` → same token (matches every other live GoDaddy store)
3. Set Railway `STORE_DOMAIN=www.<domain>` and Supabase `stores.domain=www.<domain>`.
4. Optional: GoDaddy Dashboard → Domain Forwarding → forward apex `https://<domain>` to `https://www.<domain>` (not API-supported).
5. SSL issues automatically once CNAME propagates (typically 1–5 minutes).

**One-shot script** (reads `secrets/godaddy.env` + `~/.railway/config.json`):

```powershell
.\operator\connect-store-dns.ps1 -ServiceName "Larkwell Home Shop" -ApexDomain larkwellhome.online -StoreSlug larkwell-home
```

Helper scripts live in `operator/`:
- `godaddy-dns.ps1` — list/set/delete GoDaddy DNS records
- `railway-api.ps1` — Railway GraphQL (dot-source)
- `connect-store-dns.ps1` — Railway custom domain + GoDaddy CNAME + `STORE_DOMAIN`

GoDaddy API credentials: `secrets/godaddy.env` (gitignored). Never commit.

#### Other registrars

- Point DNS (CNAME at `www`, or ALIAS/ANAME at apex if the provider supports CNAME flattening) to the Railway store deployment.
- Purchase from a different registrar than other stores when possible (bonus isolation, not required).

### 2a. Stripe Account
- When renting an aged account, first check its MCC (see MCC Compatibility below)
- Only use accounts with compatible MCCs: 5734, 5817, 5818, 5964, 5969, 5942
- Reject accounts with MCCs for physical goods (jewelry, automotive, grocery, hotels, airlines)
- Register Apple Pay domain: add the store domain in Stripe Dashboard > Settings > Payment Methods > Apple Pay
- Set the statement descriptor to match the store name
- Access the dashboard ONLY from AdsPower + NodeMaven residential IP
- Never log into multiple Stripe dashboards from the same browser profile
- Register webhook endpoint: `https://store-domain.com/webhooks/stripe`
- Set `STRIPE_WEBHOOK_SECRET` in the store's `.env`
- Note: Link is disabled via API (`payment_method_options.link.display_preference.preference: 'off'`), no Dashboard configuration needed

### 2b. PayPal Business Account (PayPal Stores)

Use when the store’s `paymentProcessor` is `paypal`.

1. **Business account setup**
   - Create or obtain a **PayPal Business** account tied to the store’s legal/branding identity.
   - Access PayPal Dashboard **only** from a **dedicated AdsPower profile** with **NodeMaven (or equivalent) residential IP** — same isolation discipline as Stripe (one profile + IP family per merchant identity).
   - Do not log into multiple PayPal Business accounts from the same browser profile.

2. **Advanced Checkout**
   - Enable **Advanced Credit and Debit Card Payments** / **Advanced Checkout** (Card Fields + PayPal buttons) per PayPal’s current dashboard flow for your region.
   - Create REST app credentials (Client ID + Secret) for **Sandbox** and **Live**; store in Railway env (see below).

3. **Apple Pay domain verification (via PayPal)**
   - When using Apple Pay **through PayPal**, complete **domain verification** in the PayPal dashboard (and any linked Apple Pay / wallet configuration PayPal requires).
   - Treat this like Stripe’s Apple Pay domain registration: the **store’s public domain** must be verified, not the campaign domain.

4. **Webhooks**
   - Register the store’s PayPal webhook URL (e.g. `https://store-domain.com/webhooks/paypal` when implemented) and capture verification IDs/secrets as required by the codebase.

5. **Railway environment variables (PayPal)**

   | Variable | Notes |
   |----------|--------|
   | `paymentProcessor` | Set in `config.js` to `paypal` (not an env var unless you override via deployment pattern). |
   | `PAYPAL_MODE` | `sandbox` (warm-up / testing) or `live` (production). |
   | `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` | Active pair for the current mode, or use split vars below. |
   | `PAYPAL_LIVE_CLIENT_ID` / `PAYPAL_LIVE_SECRET` | Production REST credentials. |
   | `PAYPAL_SANDBOX_CLIENT_ID` / `PAYPAL_SANDBOX_SECRET` | Sandbox REST credentials. |
   | Plus | `STORE_ID`, `STORE_DOMAIN`, `SUPABASE_*`, `CALLBACK_SECRET`, `CAMPAIGN_CALLBACK_URLS` — same as Stripe stores. |

6. **PayPal-specific deactivation indicators**
   - **Fund holds or rolling reserves** — sudden increase in holds often precedes limitation.
   - **Account limitations** — requests for invoices, supplier proof, or “explain spikes in volume.”
   - **Buyer complaints / chargebacks** — PayPal monitors dispute and chargeback rates; keep them negligible (same operational goal as Stripe).
   - **VAMP / network-style pressure** — card-network monitoring (e.g. Visa VAMP) still applies to card-funded wallet flows; watch for issuer TC40-style signals and **velocity** anomalies.
   - **Business description vs. website** — mismatches trigger review (parallel to Stripebot + MCC checks).

If any of the above escalate, treat the store like a **Stripe deactivation**: set status to `paused` and `weight_pct = 0` in Supabase, stop routing traffic, and rotate identity + infrastructure per **docs/ACCOUNT-ISOLATION.md**.

### 3. Store Files

**Directory scaffold:**

```
store/stores/{new-store-id}/
├── config.js
├── public/
│   └── js/
│       └── cart.js
└── views/
    ├── layouts/
    │   └── store.ejs
    ├── partials/
    │   ├── header.ejs
    │   └── footer.ejs
    └── pages/
        ├── home.ejs
        ├── about.ejs
        ├── catalog.ejs
        ├── product.ejs
        ├── cart.ejs
        ├── checkout-donor.ejs
        ├── checkout-store.ejs
        ├── faq.ejs
        ├── contact.ejs
        ├── terms.ejs
        └── privacy.ejs
```

**Step-by-step:**

1. **Create the directory** and copy the entire `views/` tree + `public/js/cart.js` from the most recent store (as of 2026-07: `luci-brand-studio` or `optimisystems`).

2. **Add a `VARIANTS` entry** to `store/lib/layout-fingerprint.js` for the new store ID:
   - Pick a unique 2-3 letter CSS variable prefix (existing: `color-`, `ds-`, `ux-`, `nv-`, `alz-`, `opt-`, `pc-`, `lk-`, `lb-`).
   - Define unique `bodyClass`, `headerClass`, `navClass`, `navId`, `overlayClass`, `overlayId`, `fontStack`, and a `variantX` function with unique CSS custom properties, animation keyframes, and class selectors.
   - **If you skip this step, the server boot will throw "No layout fingerprint defined for store ..."**

3. **Generate a per-store unique 24-price vector:**
   ```powershell
   node store/scripts/generate-prices.js --store={new-store-id} --dry-run
   node store/scripts/generate-prices.js --store={new-store-id}
   ```
   The vector is deterministic (seed = store ID). NEVER copy prices from another store.

4. **Write `config.js`** with:
   - Unique `name`, `statementDescriptor`, `tagline`
   - `contact_email` and `contact_phone` (unique per store)
   - `currency` and `currencySymbol` (match the Stripe account's country — GBP for UK, EUR for EU, USD for US)
   - Unique `colors` (primary, accent, background — must not match any other store)
   - **Unique `metadataKeys`** — every key name must differ from all other stores:
     - `referenceCode` (e.g., `brand_ref`, `vendor_id`, `outlet_ref`)
     - `storeDomain` (e.g., `merchant_host`, `shop_domain`, `origin_url`)
     - `transactionId` (e.g., `purchase_id`, `order_id`, `txn_ref`)
     - `productName` / `productSlug` / `productPrice` (unique aliases)
     - Fulfillment keys: `fulfillmentStatus`, `fulfilledAt`, `deliveryMethod` (unique aliases per store)
   - 24 products with names/descriptions aligned to the Stripe account's MCC

5. **Adapt all EJS templates.** This is the most labor-intensive step. For EACH file:
   - Replace the source store's CSS class prefix with the new variant's prefix (e.g., `opt-` → `lb-`)
   - Replace Tailwind color classes to match the new store's palette (e.g., `stone-` → `slate-`)
   - **Rewrite ALL text content** — product descriptions, about narrative, testimonials, FAQ answers, taglines. Do NOT keep another store's copy verbatim (Stripe's text similarity detection compares content across accounts)
   - Update logo SVG in `header.ejs` to a unique icon
   - Update footer content, social links, newsletter copy

6. **Adapt `cart.js`:** update `CURRENCY_SYMBOL`, notification background color, and product description text.

7. **`checkout-donor.ejs` MUST use campaign colors, NOT store colors.** The donor checkout palette must always match site A (the campaign). Hardcode: `brandPrimary = '#00b964'`, `brandDark = '#02a95c'`, `brandLight = '#e8f8f0'`. NEVER use `store.colors` in checkout-donor — the donor came from the campaign and expects visual continuity.

8. **`checkout.js` can remain identical** (standard Stripe integration code, server-side only).

9. **Run sterility check** and confirm PASS:
   ```powershell
   cd store; npm run sterility-check
   ```
   The check also runs automatically at `prestart`, so a regression will fail Railway boot.

### 4. Supabase Entry
```sql
INSERT INTO stores (domain, slug, name, status, weight_pct, max_monthly_volume)
VALUES ('www.newstore.online', 'new-store-id', 'New Store Name', 'paused', 0, 5000);
```

**Critical:** `domain` must use `www.` prefix (matches Railway `STORE_DOMAIN`, Stripe `business_profile.url`). The store starts `paused` with `weight_pct = 0` so the rotation never picks it.

**Activation sequence** (after warm-up):
1. Set `status = 'active'` and assign initial `weight_pct` (e.g., 50)
2. Rebalance other active stores so weights sum to 100
3. Example: `optimisystems` 50% + `luci-brand-studio` 50%
4. To temporarily route zero traffic while keeping a store active: set `weight_pct = 0` (store stays `active` but `get_next_store` deficit-fill skips it)

```sql
UPDATE stores SET status = 'active', weight_pct = 50 WHERE slug = 'new-store-id';
UPDATE stores SET weight_pct = 50 WHERE slug = 'optimisystems';
```

### 5. Build Artifact Cleanup
1. Verify `store/package.json` `name` is clean and generic (e.g., `store-server`).
2. Delete `store/package-lock.json`.
3. Run `npm install` in the store directory to regenerate.
4. Open the new lockfile and confirm lines 2 and 8 show the clean name.
5. Run `cd store; npm run sterility-check` and verify PASS. This replaces the older manual restricted-term check — the script is now the source of truth.

### 6. Railway Deployment

All store services live in the **GFM Cloaked** project (`7bb4befa-cbe4-4763-a782-43f1550857cd`), production environment `14944148-a284-4f59-a2cc-0b7447138f84`. The Railway CLI has known issues with workspace-scoped projects, so prefer the GraphQL API at `https://backboard.railway.com/graphql/v2`.

**Step-by-step (PowerShell, using `~/.railway/config.json` for token):**

1. **Create the service:**
```powershell
# mutation { serviceCreate(input: { name: "Store Name Shop", projectId: "7bb4befa-..." }) { id name } }
```

2. **Connect the GitHub repo:**
```powershell
# mutation { serviceConnect(id: "<serviceId>", input: { repo: "personalprojectsgr/GFM-New-Cloaked", branch: "main" }) { id } }
```

3. **Set root directory and start command:**
```powershell
# mutation { serviceInstanceUpdate(serviceId: "<serviceId>", environmentId: "<envId>", input: { rootDirectory: "store", startCommand: "npm start" }) }
```

4. **Set environment variables via `variableCollectionUpsert`:**

| Variable | Value | Notes |
|----------|-------|-------|
| `STORE_ID` | `<store-slug>` | Must match the directory name in `store/stores/` |
| `STORE_DOMAIN` | `www.<domain>` | Updated by `connect-store-dns.ps1` |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | From the Stripe account |
| `STRIPE_SECRET_KEY` | `sk_live_...` | From the Stripe account |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Set after creating webhook in Stripe Dashboard |
| `CALLBACK_SECRET` | (copy from OptimiSystems) | **SHARED** across all campaigns and stores — do NOT generate per store |
| `NODE_ENV` | `production` | |
| `PORT` | `4000` | |
| `PAYMENT_PROCESSOR` | `stripe` | |
| `SUPABASE_URL` | (copy from any live store) | Shared Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | (copy from any live store) | Shared Supabase project |
| `RESEND_API_KEY` | (copy from any live store) | Shared Resend account |
| `RESEND_BRAND` | `<Store Name>` | |
| `RESEND_FROM` | `<Store Name> <orders@domain>` | |
| `RESEND_REPLY_TO` | `hello@domain` | |
| `CAMPAIGN_CALLBACK_URLS` | (copy from any live store) | Same campaign server list |
| `APPLE_PAY_DOMAIN_ASSOCIATION` | (Stripe-issued file content) | Per-account; NEVER reuse another store's file |

Copy shared values (`CALLBACK_SECRET`, `SUPABASE_*`, `RESEND_API_KEY`, `CAMPAIGN_CALLBACK_URLS`) from any existing live store service using the `variables` GraphQL query.

5. **Trigger deployment:**
```powershell
# mutation { serviceInstanceRedeploy(serviceId: "<serviceId>", environmentId: "<envId>") }
```

6. **Wire DNS** (see § Domain Setup above):
```powershell
.\operator\connect-store-dns.ps1 -ServiceName "Store Name Shop" -ApexDomain domain.online -StoreSlug store-slug
```

The `connect-store-dns.ps1` script creates the Railway custom domain, sets the GoDaddy CNAME + TXT records, and updates `STORE_DOMAIN` on Railway. Update Supabase `stores.domain` separately.

Railway boot runs `prestart` → `node scripts/sterility-check.js` → fails the boot if the check fails.

### 7. What MUST Differ Per Store
**Content (operator-curated):**
- Domain name
- Store name and tagline
- Payment processor account — **Stripe** *or* **PayPal Business** (completely separate per store; never shared across stores)
- Product names and descriptions (text similarity detection compares CONTENT, not code)
- About text and contact email
- Statement descriptor
- **PaymentIntent metadata key names** (see `STORE-CONFIG.md`)
- **Fulfillment metadata key aliases** (`fulfillmentStatus`, `fulfilledAt`, `deliveryMethod`)
- Customer reviews content
- FAQ answers (can cover same topics, but different wording)
- Logo SVG and nav labels in `views/partials/header.ejs`

**Fingerprint (code-enforced — see `CLUSTERING-AUDIT-2026-05.md`):**
- **Layout fingerprint** — new `VARIANTS` entry in `store/lib/layout-fingerprint.js`. Drives CSS variable names, nav class names, body class, header class, transition timing, font stack.
- **24-product price vector** — run `node store/scripts/generate-prices.js --store=<id>`. Deterministic per-store unique vector.
- **Apple Pay merchant-domain-association file** — per-deploy `APPLE_PAY_DOMAIN_ASSOCIATION` env var, issued by THIS store's Stripe account.
- **`CALLBACK_SECRET`** — shared random string across all campaigns and stores (copy from a live store; see LESSONS.md 2026-07-01). Do NOT generate a unique value per store.

### 8. What CAN Be Shared (Safe Within Defense Strategy)
- Tailwind CDN, Inter font, Google Fonts preconnect — universal across the web.
- Express + Stripe SDK pinned at the same version — server-side, never reaches Stripe.
- `checkout.js`, `cart.js`, `paypal-*.js` script bodies — Stripe doesn't fingerprint script bodies.
- `decompose.js` logic — server-side, invisible to Stripe.
- Supabase project — server-side.
- Railway hosting subnet (`66.33.22.0/24`) — cloud IPs are low-signal on their own.
- Number of pages (Home, About, FAQ, Contact, etc.) — universal e-commerce pattern.
- Page structure skeleton (`<main>` + header + footer) — every storefront on the internet has this.
- `store/server.js`, `store/routes/*`, `store/lib/*` — server-side, invisible to Stripe.

### 9. Warm-up Period
- Keep status `paused` (default) while warming
- Process 3-5 small test transactions over 3-7 days
- Use real cards (friends/family or test purchases)
- Start with amounts under $20
- Gradually increase volume and amounts
- Run $5/day in ads pointing to the store's homepage (creates genuine Stripe.js browsing sessions)
- After 1-2 weeks, set status to `active` and assign a `weight_pct`, then rebalance the other active stores' weights so the sum is 100

### 10. Volume Management
- Respect `max_monthly_volume` per store (hard cap; the rotation skips a store once it hits this in the current month even if its weight says it should get more)
- `get_next_store` picks the active store whose current month-to-date share of revenue is furthest below its target `weight_pct` (deficit-fill)
- Active store weights should sum to 100; the algorithm self-corrects if they don't, but the admin UI warns on save
- Never spike more than 2x previous week's volume
- Monitor in admin dashboard

## Decommissioning a Store

### When to Decommission
- Stripe requests additional documentation or identity verification
- Stripe restricts the account or freezes payouts
- Chargeback rate exceeds 0.5%
- Unusual Stripe compliance emails
- Account flagged for review
- Stripe asks to "verify your website matches your business description"

### Decommissioning Process
1. Set store status to `paused` and `weight_pct = 0` in Supabase (rotation skips paused stores automatically; remaining active stores' weights will need to be rebalanced to sum to 100)
2. Do NOT close the Stripe account immediately (let pending charges settle for 30 days)
3. Stop using the AdsPower profile for this account
4. After 30 days, close the Stripe account
5. Let the domain expire or park it
6. Never reuse: Stripe account email, AdsPower profile, residential IP, bank account

### Full Isolation Checklist for Replacement
See **docs/ACCOUNT-ISOLATION.md** for the complete list of what must rotate and what can be reused when replacing a deactivated store.

### MATCH List Risk
If an account is MATCH-listed (5-year ban across all processors), the identity behind the account is flagged, not the website or domain. Since we rent accounts, MATCH risk falls on the account provider. See docs/RESEARCH.md > MATCH List section for details.

## Monitoring Checklist (Weekly)
- [ ] Check chargeback rate per store (must stay < 0.5%)
- [ ] Review Stripe dashboard for compliance notices
- [ ] Verify all active stores resolve in browser
- [ ] Check transaction volume distribution is balanced
- [ ] Review payment failure rates per store
- [ ] Check webhook delivery in Stripe dashboard
- [ ] Review dispute notifications
- [ ] Verify ad traffic is running to each store ($5/day)
- [ ] Check that Stripe Customer objects are being created (spot-check recent payments)

## MCC Compatibility Check

Before onboarding any rented Stripe account, verify its MCC:

### Compatible MCCs
| MCC | Description | Store Theme |
|-----|-------------|-------------|
| 5734 | Computer Software Stores | Digital tools / templates |
| 5817 | Digital Goods: Applications | SaaS tools / apps |
| 5818 | Digital Goods: Large Volume | High-volume digital products |
| 5964 | Direct Marketing - Catalog | Online catalog store |
| 5969 | Direct Marketing - Other | General e-commerce |
| 5942 | Book Stores | Ebooks / guides / courses |

### Reject These MCCs
- 3000-3299 (Airlines) — transaction size $500+
- 5511-5599 (Automotive) — transaction size $1000+
- 7011 (Hotels) — booking patterns don't match
- 5411 (Grocery) — physical goods MCC
- 5944 (Jewelry) — physical goods MCC
- 5999 (Miscellaneous Retail) — too vague, triggers review

### How to Check MCC
Stripe Dashboard > Settings > Business details > MCC is listed under "Category code"

## Dashboard Hygiene
- Use AdsPower + NodeMaven residential IP for each Stripe dashboard
- Create a separate AdsPower profile per Stripe account
- Never log into multiple Stripe accounts from the same browser profile
- Keep payout bank accounts separate (ideally different banks)
- Keep each Stripe dashboard business info distinct (address, phone, etc.)
- Set 2FA for each account using separate authenticator entries

## Pre-Deployment Sterility Check
Before setting any store to `active`, run the full checklist in **docs/TESTING-GUIDE.md**:
1. Process a test payment and verify the PaymentIntent in Stripe Dashboard
2. Confirm no donation terminology appears anywhere in the API logs
3. Verify referrer headers don't leak campaign URLs
4. Confirm cookies are httpOnly and field names are sanitized
5. Verify L2/L3 line items appear in the payment details
6. Ensure Stripe Customer is attached post-payment
7. Ensure `receipt_email` is set post-payment
8. Ensure fulfillment metadata is set post-payment (using aliased key names from config.js)
9. Verify Link is disabled in the PaymentElement
10. Verify `package.json` and `.env` contain no identifying strings
11. Delete and regenerate `package-lock.json`, verify clean name on lines 2 and 8
12. Grep entire project for restricted terms
13. Verify fulfillment key aliases are unique (not shared with any other store)
14. Verify CAPI Purchase deduplication: browser pixel and server CAPI use the same event_id
