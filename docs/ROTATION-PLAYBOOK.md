# Store Rotation Playbook

## Adding a New Store

### 1. Domain Setup
- Purchase a new domain (use a different registrar than other stores if possible)
- Point DNS (A or CNAME record) to the new Railway store deployment

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

6. **PayPal-specific burn indicators**
   - **Fund holds or rolling reserves** — sudden increase in holds often precedes limitation.
   - **Account limitations** — requests for invoices, supplier proof, or “explain spikes in volume.”
   - **Buyer complaints / chargebacks** — PayPal monitors dispute and chargeback rates; keep them negligible (same operational goal as Stripe).
   - **VAMP / network-style pressure** — card-network monitoring (e.g. Visa VAMP) still applies to card-funded wallet flows; watch for issuer TC40-style signals and **velocity** anomalies.
   - **Business description vs. website** — mismatches trigger review (parallel to Stripebot + MCC checks).

If any of the above escalate, treat the store like a **Stripe burn**: set status to `burned`, stop routing traffic, and rotate identity + infrastructure per **docs/ACCOUNT-ISOLATION.md**.

### 3. Store Files
1. Create `store/stores/{new-store-id}/` directory
2. Copy from existing store (template/code sharing is safe), then customize:
   - `config.js`: unique name, statement descriptor, **unique metadata keys** (including fulfillment keys), products with irregular prices
   - All EJS page content: unique product descriptions, about text, reviews, FAQ answers
3. `cart.js` and `checkout.js` can remain identical (standard Stripe integration code)
4. Fulfillment keys in `config.js` `metadataKeys`:
   - `fulfillmentStatus` — aliased name for delivery status (e.g., "file_status", "order_state")
   - `fulfilledAt` — aliased name for fulfillment timestamp (e.g., "access_granted", "completed_at")
   - `deliveryMethod` — aliased name for delivery type (e.g., "file_delivery", "send_method")
   - Each alias MUST be unique across all stores

### 4. Supabase Entry
```sql
INSERT INTO stores (domain, slug, name, status, max_monthly_volume)
VALUES ('new-store.com', 'new-store-id', 'New Store Name', 'warming', 5000);
```

### 5. Build Artifact Cleanup
1. Verify `store/package.json` `name` is clean and generic (e.g., "store-server")
2. Delete `store/package-lock.json`
3. Run `npm install` in the store directory to regenerate
4. Open the new lockfile and confirm lines 2 and 8 show the clean name
5. Run `rg -i "gfm|cloaked|donation|campaign|fundrais" --type json` and verify zero matches

### 6. Railway Deployment
- Create a NEW Railway service for this store
- Set environment variables (STORE_ID, STRIPE keys, CALLBACK_SECRET, etc.)
- CRITICAL: Use a generic CALLBACK_SECRET (no "gfm", "cloaked", or "donation" in the value)
- Deploy from the `store/` directory

### 7. What MUST Differ Per Store (Content)
- Domain name
- Store name and tagline
- Payment processor account — **Stripe** *or* **PayPal Business** (completely separate per store; never shared across stores)
- Product names and descriptions (text similarity detection compares CONTENT, not code)
- About text and contact email
- Statement descriptor
- **PaymentIntent metadata key names** (see STORE-CONFIG.md)
- **Fulfillment metadata key aliases** (fulfillmentStatus, fulfilledAt, deliveryMethod)
- Customer reviews content
- FAQ answers (can cover same topics, but different wording)

### 8. What CAN Be Shared (Template/Code)
Stripe's clustering compares semantic content, not HTML/CSS structure. Millions of merchants use identical Shopify themes and SamCart templates — template sharing is safe.
- HTML/CSS template structure and EJS layout
- Page structure and template code layout
- `checkout.js` and `cart.js` logic
- `decompose.js` logic
- Tailwind CSS classes and color scheme
- Supabase database
- Number of products (24)
- Price point coverage ranges
- Number of pages
- Font (Inter)

### 8. Warm-up Period
- Set status to `warming`
- Process 3-5 small test transactions over 3-7 days
- Use real cards (friends/family or test purchases)
- Start with amounts under $20
- Gradually increase volume and amounts
- Run $5/day in ads pointing to the store's homepage (creates genuine Stripe.js browsing sessions)
- After 1-2 weeks, set status to `active`

### 9. Volume Management
- Respect `max_monthly_volume` per store
- Round-robin distributes traffic across active stores
- Never spike more than 2x previous week's volume
- Monitor in admin dashboard

## Burning a Store

### When to Burn
- Stripe requests additional documentation or identity verification
- Stripe restricts the account or freezes payouts
- Chargeback rate exceeds 0.5%
- Unusual Stripe compliance emails
- Account flagged for review
- Stripe asks to "verify your website matches your business description"

### Burn Process
1. Set store status to `burned` in Supabase (round-robin skips it automatically)
2. Do NOT close the Stripe account immediately (let pending charges settle for 30 days)
3. Stop using the AdsPower profile for this account
4. After 30 days, close the Stripe account
5. Let the domain expire or park it
6. Never reuse: Stripe account email, AdsPower profile, residential IP, bank account

### Full Isolation Checklist for Replacement
See **docs/ACCOUNT-ISOLATION.md** for the complete list of what must rotate and what can be reused when replacing a burned store.

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
12. Grep entire project for prohibited terms: `rg -i "gfm|cloaked|donation|campaign|fundrais"`
13. Verify fulfillment key aliases are unique (not shared with any other store)
14. Verify CAPI Purchase deduplication: browser pixel and server CAPI use the same event_id
