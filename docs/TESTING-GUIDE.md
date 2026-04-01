# Testing & Sterility Verification Guide

## Purpose

After deploying a store, run through this checklist to verify that Stripe receives ZERO donation-related data and all cloaking layers function correctly.

---

## Step 1: Environment Setup

### Test Mode
Use Stripe test keys (`sk_test_...`, `pk_test_...`) from any Stripe account.

### Local Run
```bash
cd store
npm install
STORE_ID=zenflow-tools \
STORE_DOMAIN=localhost \
PORT=4000 \
STRIPE_SECRET_KEY=sk_test_... \
STRIPE_PUBLISHABLE_KEY=pk_test_... \
node server.js
```

### Test Cards
| Card Number | Behavior |
|------------|---------|
| `4242 4242 4242 4242` | Visa, succeeds |
| `5555 5555 5555 4444` | Mastercard, succeeds |
| `4000 0025 0000 3155` | Requires 3D Secure |
| `4000 0000 0000 0002` | Declined |

Use any future expiry date, any 3-digit CVC, any cardholder name.

---

## Step 2: Full Flow Test

### Campaign → Store Flow
1. Visit campaign page, select donation amount (e.g., €50)
2. Click Donate → should redirect to store's `/s/TOKEN` endpoint
3. `/s/TOKEN` should set httpOnly cookie and meta-refresh to `/checkout`
4. `/checkout` should render the donor checkout (compact card form with email/name fields)
5. Stripe PaymentElement mounts after ~1.2s delay
6. Enter test card, email, name → submit
7. Payment succeeds → redirect back to campaign with `?status=complete`
8. Campaign shows thank-you overlay with share buttons

### Direct Store Visit (Stripebot Simulation)
1. Visit store homepage directly (no cookie)
2. Navigate: home → products → product detail → cart → checkout
3. `/checkout` without `__session` cookie should render full store checkout
4. Verify all pages render: `/`, `/products`, `/products/slug`, `/about`, `/contact`, `/terms`, `/privacy`, `/faq`, `/cart`, `/search?q=test`

---

## Step 3: Stripe Dashboard Verification

After a successful test payment, check these in the Stripe Dashboard:

### A. PaymentIntent Details (Dashboard > Payments > click payment)

| Check | Expected | Red Flag |
|-------|----------|----------|
| `description` | Product names like "1x Quick Start Business Plan, 1x Invoice Pro Template" | Any mention of "donation" |
| `metadata` keys | Store-specific keys (e.g., `shop_id`, `order_ref`) | Default keys or donation terms |
| `metadata` values | Store domain, reference code, order summary | Campaign URLs or donation references |
| `statement_descriptor_suffix` | Store name (e.g., "ZENFLOW TOOLS") | Campaign name or "GFM" |
| `customer` | Stripe Customer ID (cus_xxx) — attached post-payment | Empty/null |
| `receipt_email` | Email entered by user — attached post-payment | Empty (receipts won't send) |
| `automatic_payment_methods` | `enabled: true`, `allow_redirects: never` | `payment_method_types` array |
| `payment_method_options.link` | `display_preference.preference: off` | Link enabled |

### B. Amount Details & Line Items

| Check | Expected | Red Flag |
|-------|----------|----------|
| `amount_details.line_items[]` | Array of products with names, codes, quantities, prices | Missing or empty |
| Each line item `unit_of_measure` | "ACT" | Missing |
| Each line item `product_code` | Slug-based code (e.g., "QUICKSTARTBU") | Generic or missing |
| Each line item `tax.total_tax_amount` | 0 | Non-zero (we don't charge tax) |
| Sum of (unit_cost × quantity) across all items | Equals PaymentIntent `amount` exactly | Mismatch (L2/L3 dropped) |
| `payment_details.order_reference` | Reference code (e.g., "458C-A3B2D1") | Missing or contains campaign slug |

### C. Post-Payment Metadata (after confirm-payment)

| Check | Expected | Red Flag |
|-------|----------|----------|
| `fulfillment_status` | "delivered" | Missing |
| `delivery_method` | "digital_download" | Missing |
| `fulfilled_at` | ISO timestamp | Missing |
| `customer` | cus_xxx (Stripe Customer) | null |
| `receipt_email` | User's email | null |

### D. API Request Log (Dashboard > Developers > Logs)

Find the `POST /v1/payment_intents` request and verify:
- No field contains "donation", "donor", "campaign", "fundraiser", "GFM"
- `automatic_payment_methods[enabled]` = true
- `automatic_payment_methods[allow_redirects]` = never
- `payment_method_options[link][display_preference][preference]` = off
- `payment_details[order_reference]` is present
- `amount_details[line_items]` array is present with all required fields

Find the `POST /v1/payment_intents/:id` update request (post-payment) and verify:
- `customer` is set to a cus_xxx ID
- `receipt_email` is set
- `metadata[fulfillment_status]` = delivered
- `metadata[delivery_method]` = digital_download

### E. Stripe Customer (Dashboard > Customers)

After a successful payment, a Stripe Customer should exist with:
- The email entered during checkout
- The cardholder name (if provided)
- Linked to the PaymentIntent

### F. Webhook Events (Dashboard > Developers > Webhooks)

- Verify endpoint is registered and active
- Check recent deliveries for `payment_intent.succeeded`
- Verify HTTP 200 responses

---

## Step 4: Referrer Chain Verification

### Test the Referrer Break
1. Open browser DevTools > Network tab
2. Navigate from campaign to store via the donation flow
3. On the `/checkout` page, check the `Referer` header on the Stripe.js requests to `m.stripe.com`
4. It should show the STORE domain only, never the campaign domain

### Verify in Stripe's Elements Session Request
1. Look for `GET /v1/elements/sessions` in the Network tab
2. Check the `referrer_host` query parameter — it should be the store domain (e.g., `localhost:4000` in test, `zenflow-tools.com` in production)
3. It should NEVER be the campaign domain

### Verify Headers
1. Visit any store page
2. Check response headers: `Referrer-Policy: strict-origin-when-cross-origin`
3. Visit `/s/TOKEN` — the HTML source should contain `<meta name="referrer" content="no-referrer">`

---

## Step 5: Cookie Verification

1. Open browser DevTools > Application > Cookies
2. After visiting `/s/TOKEN`, the `__session` cookie should be:
   - `httpOnly`: true (not readable by JavaScript, meaning Stripe.js cannot read it)
   - `secure`: true (in production)
   - `sameSite`: Lax
   - `path`: /
   - `maxAge`: 600 seconds (10 minutes)
3. The cookie value is JSON with sanitized field names: `sid`, `amount`, `currency`, `lang`, `ref`, `fee`, `guest`, `email`, `utm`, `ip`, `ua`, `storeId`
4. NO field should contain "donation", "donor", "campaign"

### Known Acceptable Content
- `ref` field contains campaign slug (e.g., "leukemia-sofia") — this is inside an httpOnly cookie, invisible to Stripe.js and all client-side scripts
- `sourceUrl` in `utm` may contain campaign URL — same protection applies

---

## Step 6: API Version Check

In Stripe Dashboard > Developers > API version:
- Our server pins API version `2025-03-31.basil` in the Stripe constructor
- This overrides the account's default API version for our requests
- For L2/L3 line items: requires `2025-04-30.preview` or later (our pinned version qualifies)
- If `amount_details.line_items` does NOT appear in the PaymentIntent response, the account may need Enhanced Commerce Data enabled by Stripe support

---

## Step 7: Payment Method Verification

In Stripe Dashboard > Settings > Payment methods:
- Card: enabled
- Link: should appear as disabled (we disable via API: `payment_method_options.link.display_preference.preference: 'off'`)
- Apple Pay: enabled (requires domain registration)
- Google Pay: enabled
- Redirect-based methods (iDEAL, Bancontact, etc.): may be enabled in Dashboard but filtered by `allow_redirects: never`

To register Apple Pay domain:
Dashboard > Settings > Payment Methods > Apple Pay > Add new domain > enter store domain

---

## Step 8: DevTools Deep Verification

### Stripe.js Telemetry Requests
1. Open DevTools > Network tab, filter by `m.stripe.com`
2. These are encrypted telemetry requests — you can't read the payload
3. Verify the `Origin` header is the store domain
4. Verify no requests go to `m.stripe.com` from the campaign domain

### Cookie Isolation
1. In the Application tab, verify only these cookies exist on the store domain:
   - `__session` (httpOnly — yours)
   - `__stripe_mid` (Stripe device fingerprint — persistent, `SameSite: strict`)
   - `__stripe_sid` (Stripe session ID — per-session, `SameSite: strict`)
2. The `__stripe_mid` and `__stripe_sid` cookies are Stripe's own — they cannot read `__session` (cross-cookie access is impossible)
3. The `_fbp` cookie (Meta Pixel) may be present — this is from campaign, leaks nothing to Stripe

---

## Step 9: Build Artifact Sterility

### Package Lockfile Check
1. Open `store/package-lock.json`, check line 2 (`"name"` field) — must be "store-server" or similar generic name
2. Check line 8 (nested `"name"` field) — same generic name
3. If stale names found (e.g., "gfm-cloaked-store"), delete `package-lock.json` and run `npm install`
4. Repeat for `campaign/package-lock.json` (should be "campaign-server")

### Full Project Grep
Run: `rg -i "gfm|cloaked|donation|campaign|fundrais" --type json --type js --type ejs`

This should return zero matches in any deployed file. Acceptable matches: documentation files (`.md`), plan files, and SQL scripts that aren't deployed.

---

## Step 10: Fulfillment Key Uniqueness

1. Collect fulfillment key aliases from each store's `config.js`:
   - `metadataKeys.fulfillmentStatus`
   - `metadataKeys.fulfilledAt`
   - `metadataKeys.deliveryMethod`
2. Verify no two stores share any alias value
3. Verify each alias feels natural for the store's MCC/product type

Example verification:
| Store | fulfillmentStatus | fulfilledAt | deliveryMethod |
|-------|-------------------|-------------|----------------|
| haven-prints | `file_status` | `access_granted` | `file_delivery` |
| zenflow-tools | `order_state` | `completed_at` | `send_method` |
| nova-essentials | `delivery_state` | `dispatched_at` | `access_type` |

All 9 values must be distinct.

---

## Step 11: CAPI Purchase Deduplication

1. Make a test donation through the full flow (campaign -> store -> payment -> return)
2. Open Meta Events Manager > Test Events
3. Look for two Purchase events with the same `event_id`:
   - One labeled "Browser" (from the campaign page pixel on return)
   - One labeled "Server" (from the campaign server CAPI via callback)
4. If only one appears, check:
   - Does `sessionStorage` have `_purchase_event_id` after clicking "Donate"? (Before redirect)
   - Does the browser pixel fire when returning with `?status=complete`?
   - Does the server CAPI receive the `eventId` in the callback tracking data?
5. In TikTok Events Manager, verify the same pattern for the CompletePayment event

---

## Sterility Checklist Summary

Run through this after every new store deployment:

- [ ] No "donation"/"donor"/"campaign"/"GFM" in PaymentIntent metadata, description, or statement descriptor
- [ ] `payment_details.order_reference` present and contains no campaign slug
- [ ] `amount_details.line_items` present with `unit_of_measure: ACT`
- [ ] Line item arithmetic matches PaymentIntent amount exactly
- [ ] `automatic_payment_methods.enabled` = true, `allow_redirects` = never
- [ ] `payment_method_options.link.display_preference.preference` = off
- [ ] Stripe Customer attached post-payment (not null)
- [ ] `receipt_email` set post-payment (not null)
- [ ] Fulfillment metadata set post-payment using aliased key names from config.js (NOT hardcoded defaults)
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` on all responses
- [ ] `referrer_host` in Stripe Elements session = store domain only
- [ ] Meta-refresh at `/s/:token` has `<meta name="referrer" content="no-referrer">`
- [ ] `__session` cookie is httpOnly
- [ ] Redirect parameter is `?status=complete` (not `?donated=true`)
- [ ] Webhook endpoint registered and receiving events
- [ ] Store homepage, products, about, terms, privacy, FAQ all render correctly
- [ ] Store checkout (without cookie) renders full store experience for Stripebot
- [ ] `package.json` name fields are generic (no "gfm" or "cloaked")
- [ ] `package-lock.json` name fields are generic (check lines 2 and 8 — regenerate if stale)
- [ ] `.env` CALLBACK_SECRET is generic (no "gfm" or "cloaked")
- [ ] Full project grep for prohibited terms: `rg -i "gfm|cloaked|donation|campaign|fundrais"` returns zero matches in deployed files
- [ ] Fulfillment key aliases are unique across all stores (no two stores share `fulfillmentStatus`, `fulfilledAt`, or `deliveryMethod` alias values)
- [ ] CAPI Purchase deduplication: verify browser pixel and server CAPI fire with the same `event_id` (check Meta Events Manager > Test Events)
