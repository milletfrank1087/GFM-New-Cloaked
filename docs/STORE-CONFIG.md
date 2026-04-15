# Store Configuration Guide

## Store Directory Structure

Each store lives in `store/stores/{store-id}/`:

```
store/stores/zenflow-tools/
├── config.js           # Store config (name, products, metadata keys)
├── public/
│   └── js/
│       ├── checkout.js # Stripe payment flow
│       └── cart.js     # localStorage cart system
└── views/
    ├── layouts/
    │   └── store.ejs   # Main layout wrapper
    ├── partials/
    │   ├── header.ejs  # Header with search
    │   ├── nav.ejs     # Navigation with cart badge
    │   └── footer.ejs  # Footer
    └── pages/
        ├── home.ejs
        ├── catalog.ejs
        ├── product.ejs         # With reviews section
        ├── checkout-donor.ejs  # Donor flow (compact payment form)
        ├── checkout-store.ejs  # Full store checkout (for Stripebot)
        ├── cart.ejs            # Dynamic cart page
        ├── about.ejs
        ├── contact.ejs
        ├── faq.ejs
        ├── terms.ejs
        └── privacy.ejs
```

## config.js Schema

```javascript
module.exports = {
  name: 'Store Name',
  paymentProcessor: 'stripe',           // Required: 'stripe' | 'paypal' — exactly ONE per store
  statementDescriptor: 'STORE NAME',    // Max 22 chars, appears on bank statements (Stripe); align with PayPal business branding for PayPal stores
  metadataKeys: {                        // Store-specific PaymentIntent / order metadata key names
    storeId: 'shop_id',                  // Must differ per store
    storeDomain: 'shop_url',
    referenceCode: 'order_ref',
    sessionRef: 'checkout_id',
    subtotal: 'item_total',
    serviceFee: 'processing_fee',
    guestCheckout: 'express_checkout',
    orderSummary: 'items',
    fulfillmentStatus: 'order_state',    // Post-payment: marks delivery complete
    fulfilledAt: 'completed_at',         // Post-payment: fulfillment timestamp
    deliveryMethod: 'send_method',       // Post-payment: delivery type
  },
  products: [
    {
      name: 'Product Name',
      slug: 'product-name',
      price: 49.99,                      // Use irregular prices (not round numbers)
      category: 'Templates',
      description: '1-2 sentence description.'
    },
    // ... 23 more products
  ],
};
```

### `paymentProcessor` Field

| Value | Meaning |
|-------|---------|
| `stripe` | Default. Store uses Stripe PaymentIntents, Elements, and Stripe webhooks. Requires `STRIPE_*` env vars. |
| `paypal` | Store uses PayPal Orders v2 (Advanced Checkout pattern), Card Fields and/or PayPal button as implemented. Requires `PAYPAL_*` env vars. |

Rules:

- **One processor per store** — do not enable both Stripe and PayPal on the same deployment.
- Campaign **round-robin does not filter by processor**; all `active` stores compete equally. Ensure every store in rotation is production-ready for its processor.
- `metadataKeys` still define **per-store aliasing** for payment records sent to Supabase and any processor-visible custom fields; keep names and values free of donation terminology.

## Product Price Guidelines

- Use irregular prices: $4.97, $6.99, $8.49, $9.97, $11.99, etc.
- Never use round numbers ($5, $10, $20)
- Ensure price coverage for common donation amounts (decompose algorithm handles gaps)
- Product list should cover range from ~$5 to ~$500

## Metadata Key Differentiation

Each store MUST use different metadata key names to prevent cross-store pattern detection:

| Field | ZenFlow Keys | Nova Keys | Haven Prints Keys |
|-------|-------------|-----------|-------------------|
| Store ID | `shop_id` | `vendor_id` | `store_ref` |
| Domain | `shop_url` | `origin` | `shop_domain` |
| Reference | `order_ref` | `txn_ref` | `ref_code` |
| Session | `checkout_id` | `session_id` | `session_ref` |
| Subtotal | `item_total` | `base_amount` | `order_total` |
| Fee | `processing_fee` | `platform_fee` | `handling_fee` |
| Guest | `express_checkout` | `quick_pay` | `guest_mode` |
| Summary | `items` | `line_items` | `cart_items` |
| Fulfillment Status | `order_state` | `delivery_state` | `file_status` |
| Fulfilled At | `completed_at` | `dispatched_at` | `access_granted` |
| Delivery Method | `send_method` | `access_type` | `file_delivery` |

### Fulfillment Keys (Post-Payment)

Three additional metadata keys are updated AFTER a successful payment to record fulfillment evidence. These keys are critical for Stripe account health — they prove the merchant delivered goods/services.

| Internal Key | Purpose | When Updated |
|-------------|---------|--------------|
| `fulfillmentStatus` | Records delivery completion (value: "delivered") | Post-payment webhook/callback |
| `fulfilledAt` | ISO timestamp of delivery | Post-payment webhook/callback |
| `deliveryMethod` | How delivered (value: "digital_download") | Post-payment webhook/callback |

These MUST be aliased per store, just like all other metadata keys. The server reads them from `storeConfig.metadataKeys` with fallbacks to the default names. Choose alias names that match the store's MCC and product context.

When adding a new store, choose entirely new key names. Examples for a new store:

| Field | Possible Keys |
|-------|--------------|
| Store ID | `merchant_id`, `seller_ref`, `outlet_id` |
| Domain | `site`, `merchant_url`, `source_url` |
| Reference | `purchase_ref`, `confirmation`, `receipt_id` |
| Session | `cart_id`, `basket_ref`, `transaction_id` |
| Subtotal | `goods_total`, `product_sum`, `cart_amount` |
| Fee | `handling_fee`, `service_charge`, `admin_fee` |
| Guest | `fast_checkout`, `guest_mode`, `express_pay` |
| Summary | `products`, `cart_items`, `purchase_items` |
| Fulfillment Status | `provision_state`, `release_status`, `item_state` |
| Fulfilled At | `provisioned_at`, `released_at`, `delivered_on` |
| Delivery Method | `provision_method`, `release_type`, `access_mode` |

## Color Scheme

All stores use the same color scheme as the campaign for seamless redirect UX. This is safe because Stripe compares semantic content, not CSS colors (see docs/RESEARCH.md > Template Sharing Analysis).

| Property | Value | Usage |
|----------|-------|-------|
| Primary | `#00b964` | Buttons, accents, links, focus states |
| Dark | `#02a95c` | Button hover, gradients |
| Light | `#e8f8f0` | Light backgrounds, badges |
| Text | `#333333` | Body text |
| Muted | `#6b7280` | Secondary text |
| Background | `#ffffff` | Page background |
| Font | Inter | All text |

Future stores should use the same colors for consistency.

## Environment Variables (per store `.env`)

```env
PORT=4000
STORE_ID=zenflow-tools
STORE_DOMAIN=zenflow-tools.com
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_URL=https://wzialsfdguuircomaqvp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
CALLBACK_SECRET=your-secret
CAMPAIGN_CALLBACK_URLS=https://el.risehope.online,https://it.risehope.online
NODE_ENV=production
```

### PayPal Environment Variables (per store `.env`)

Use these **instead of** Stripe keys when `paymentProcessor` is `paypal`. Never commit real secrets.

| Variable | Purpose |
|----------|---------|
| `PAYPAL_MODE` | `sandbox` or `live` — selects which credential pair the server uses. |
| `PAYPAL_CLIENT_ID` | REST app **Client ID** for the active mode (convenience single-pair setup). |
| `PAYPAL_SECRET` | REST app **Secret** for the active mode. |
| `PAYPAL_LIVE_CLIENT_ID` | Live Client ID (optional explicit split; use when rotating without touching sandbox). |
| `PAYPAL_LIVE_SECRET` | Live secret. |
| `PAYPAL_SANDBOX_CLIENT_ID` | Sandbox Client ID. |
| `PAYPAL_SANDBOX_SECRET` | Sandbox secret. |

Typical patterns:

- **Simple:** Set `PAYPAL_MODE` and `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` only.
- **Split:** Set `PAYPAL_MODE` plus the `PAYPAL_LIVE_*` and `PAYPAL_SANDBOX_*` pairs so deployments can switch mode without rewriting credentials.

Shared with Stripe stores: `SUPABASE_*`, `CALLBACK_SECRET`, `CAMPAIGN_CALLBACK_URLS`, `STORE_ID`, `STORE_DOMAIN`, `PORT`, `NODE_ENV`.

CRITICAL: `CALLBACK_SECRET` must be a generic string with no project-identifying words. Never use "gfm", "cloaked", "donation", etc.

### Example PayPal Store `config.js` (excerpt)

```javascript
module.exports = {
  name: 'Acme Digital Supply',
  paymentProcessor: 'paypal',
  statementDescriptor: 'ACME DIGITAL', // Keep aligned with PayPal business name / descriptor rules
  metadataKeys: {
    storeId: 'merchant_ref',
    storeDomain: 'site_url',
    referenceCode: 'invoice_id',
    sessionRef: 'cart_session',
    subtotal: 'goods_total',
    serviceFee: 'service_fee',
    guestCheckout: 'express',
    orderSummary: 'line_summary',
    fulfillmentStatus: 'ship_status',
    fulfilledAt: 'shipped_at',
    deliveryMethod: 'fulfillment_type',
  },
  products: [
    { name: 'Pro Template Pack', slug: 'pro-template-pack', price: 47.99, category: 'Templates', description: 'Editable business templates.' },
    // ... remaining products with irregular prices
  ],
};
```

Publishable PayPal **Client ID** (not the secret) is exposed to the browser for the JS SDK; configure it per environment as required by your `checkout` implementation (e.g. layout partial or env-injected global).

## Creating a New Store

1. Create directory: `store/stores/{new-store-id}/`
2. Copy structure from an existing store (template/code sharing is safe)
3. Customize `config.js` with unique name, products, metadata keys, prices
4. Write unique text content for all pages (product descriptions, about, reviews)
5. Create processor credentials: **Stripe** account + API keys, **or** **PayPal Business** + REST app (sandbox + live) per STORE-CONFIG PayPal env section
6. Add store to Supabase `stores` table
7. Deploy as separate Railway service
8. Warm up with test transactions (see ROTATION-PLAYBOOK.md)

## Checkout Behavior

### Donor Checkout (`checkout-donor.ejs`)
Rendered when `__session` cookie is present (donor came from campaign):
- Compact card with email + name fields, total amount, and the active processor UI (**Stripe** PaymentElement or **PayPal** Card Fields / buttons, depending on `paymentProcessor`)
- "Your payment is protected" reassurance section with SSL info
- Stripe: PaymentElement mounts immediately; Link disabled (no "save my information" prompt)
- AddPaymentInfo event fires on payment element focus (user interaction), not on initial render
- PayPal: SDK and fields load only when `paymentProcessor` is `paypal` (see ARCHITECTURE.md — conditional SDK loading)
- Legal links to terms and privacy at bottom

### Store Checkout (`checkout-store.ejs`)
Rendered when no `__session` cookie (Stripebot / PayPal crawlers, manual reviewer, direct visitor):
- Full e-commerce checkout with cart summary, product images
- Shipping/billing forms
- Standard e-commerce experience

## Supabase Tables

### `checkout_sessions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `token` | text | Unique session token |
| `amount` | numeric | Base amount |
| `currency` | text | Currency code |
| `source_ref` | text | Campaign reference |
| `store_id` | uuid | Target store |
| `language` | text | Locale code |
| `service_fee` | numeric | Platform fee |
| `guest_checkout` | boolean | Anonymous flag |
| `customer_email` | text | Email if provided |
| `tracking` | jsonb | UTM/pixel data |
| `ip_address` | text | Client IP |
| `user_agent` | text | Browser UA |
| `claimed` | boolean | Whether token was used |
| `claimed_at` | timestamptz | When token was claimed |
| `expires_at` | timestamptz | Expiration |

### `payments`

| Column | Type | Description |
|--------|------|-------------|
| `customer_id` | uuid | FK to customers |
| `store_id` | uuid | FK to stores |
| `store_domain` | text | Store domain |
| `source_ref` | text | Campaign reference |
| `stripe_payment_intent_id` | text | Stripe PI ID |
| `stripe_charge_id` | text | Stripe charge ID |
| `amount` | numeric | Base amount |
| `service_fee` | numeric | Platform fee |
| `total_amount` | numeric | Total charged |
| `stripe_fee` | numeric | Stripe's fee |
| `net_amount` | numeric | Net after fees |
| `currency` | text | Currency code |
| `payment_source` | text | card/apple_pay/google_pay/link |
| `status` | text | completed/failed/refunded |
| `line_items` | jsonb | Decomposed products |
| `customer_name` | text | Display name |
| `billing_name` | text | Card holder name |
| `guest_checkout` | boolean | Anonymous flag |
| `card_*` | various | Card details (last4, brand, expiry, type) |
| `customer_email` | text | Email |
| `ip_address` | text | Client IP |
| `user_agent` | text | Browser UA |
| `utm_*` / `fb*` / `tt*` | various | Tracking fields |
| `stripe_response` | jsonb | Raw Stripe response data |

### `customers`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Display name |
| `initials` | text | 2-char initials |
| `email` | text | Unique email |
| `card_holder_name` | text | Full name from card |
| `first_purchase_at` | timestamptz | First payment date |
| `country` | text | Billing country |
| `color_gradient` | text | UI gradient class |
| `total_donated` | numeric | Auto-computed by trigger |
| `donation_count` | integer | Auto-computed by trigger |
| `utm_*` | various | First-touch attribution |
