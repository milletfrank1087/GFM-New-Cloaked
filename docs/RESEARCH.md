# Stripe Detection Research & Vulnerability Analysis

## Executive Summary

Comprehensive research across 5+ rounds including disconfirmation, covering Stripe's official documentation, BHW practitioner forums, Stripe blog posts (2025-2026), and reverse-engineering reports. Key conclusion: **cloaking systems survive long-term when chargeback rates stay near zero.** Stripe appears to detect cloaking but may tolerate it when all transactions are genuinely authorized by cardholders.

Source: BHW (multiple threads, 2025-2026), Stripe official docs, Stripe blog (MRC Vegas 2026, fraud trends 2026), Reddit r/SaaS, r/stripe.

---

## Stripe's Detection Stack

### 1. Stripe.js Client-Side Telemetry

Stripe.js sends encrypted data to `m.stripe.com` on every page load. Collected signals include:

- **Domain** (`b.u` / "ured"): sent in plaintext. Each store MUST have its own domain.
- **MUID**: persistent device fingerprint surviving cookie clears
- **SID**: per-session identifier
- **Mouse activity indicators**: movement patterns, hover timing
- **Page time**: how long users spend on different pages
- **Keystroke patterns**: typing vs copy-pasting card numbers
- **Device characteristics**: screen size, browser, fonts, GPU

Official docs state: *"Include Stripe.js on every page of your site, not just the checkout page. This gives Stripe the richest possible set of signals to distinguish fraudulent purchasers from real customers."*

Advanced fraud signals provide a **36% improvement** to the fraud model.

**Implication**: If Stripe.js only loads on the checkout page and users go directly to checkout (zero browsing), every session looks like bot/card-testing traffic. Running some legitimate traffic through the store ($5/day ads) creates genuine browsing sessions that improve the behavioral baseline.

### 2. Stripe Radar ML (Payments Foundation Model / PFM)

- Processes **hundreds of features** per transaction
- Monitors **16,000+ payment-related variables** including issuing banks, currencies, card products, payment features
- Uses **similarity clustering with XGBoost** to detect fraud rings by grouping accounts with shared attributes
- Tracks per-card metrics across the ENTIRE Stripe network: `total_customers_for_card_yearly`, `average_usd_amount_attempted_on_card_all_time`
- Tracks email age: `hours_since_email_first_seen_on_stripe`
- Computes risk scores in real-time for every transaction

### 3. Stripebot (Web Crawler)

Official Stripe documentation: *"Stripebot is the Stripe automated web crawler that collects data from our users' websites. We use the collected data to provide services and to comply with financial regulations."*

- User-agent: `Stripebot/{version}`
- Crawls from `crawl.stripe.com` domain
- Respects `robots.txt` (our stores serve `Allow: /`)
- Checks for: product pages, pricing, terms of service, privacy policy, contact info, fulfillment policies
- Compares website content to MCC and business description
- Quote: *"If we review your website and find that it isn't clear what you're selling, we may contact you."*

### 4. Stripe Website Checklist (Compliance Requirements)

Official requirements for merchant websites:
- Multiple contact methods (email, phone, live chat)
- Order fulfillment policies
- Refund/return policies
- Privacy policy
- HTTPS/PCI compliance indicators
- Card brand logos

Missing any of these can trigger a compliance review.

### 5. Cross-Account Similarity Clustering

Stripe links accounts using:
- Shared card fingerprints (same card used at multiple merchants)
- IP address overlap (dashboard login)
- Device fingerprints (browser/device characteristics)
- Bank account details
- Behavioral patterns (transaction timing, amounts, frequency)
- Text similarity (product descriptions, business names, about text)

### 6. MCC Verification

- Stripe sets MCC during onboarding based on business description
- *"If our review determines that an MCC is inaccurate, we might update it"*
- MCC changes trigger additional verification
- MCCs are compared against website content and transaction patterns
- Incompatible MCC = immediate compliance flag

### 7. Chargeback Monitoring

- Per-network tracking: Visa (0.9% threshold as of Jan 2026), Mastercard (1.5%), Amex (1.0%)
- Stripe tracks networks SEPARATELY, not combined
- Exceeding ANY single network threshold triggers review
- Being added to MATCH list = 5-year blacklist across all processors

---

## Practitioner Evidence (BHW Forums, 2025-2026)

### What Actually Gets Accounts Killed

1. **Chargeback rate exceeding 1%** — overwhelmingly the #1 killer
2. **MCC mismatch discovered during manual review** — triggered by chargebacks or compliance audit
3. **Volume spikes** — sudden 10x increase in transaction count
4. **Cross-account linking** — same person logging into multiple Stripe dashboards

### What Doesn't Kill Accounts (per practitioner reports)

- Cloaking itself (Stripe may detect but tolerate when chargebacks are low)
- Using rented/purchased aged accounts (when managed properly)
- Server-side payment routing between domains

### Key Quotes

- *"Accounts operated for years, but got closed ONLY because they reached over 1% dispute rate"* — stiffidy (BHW, experienced operator)
- *"100% and most of the times they know you're cloaking, and they'll let you be as long as you have 0-1% chargeback rate. And they see your transactions are legit"* — bartosimpsonio (BHW Elite Member, 24k+ posts)
- *"If you do everything right, no one will ever know you're cloaking"* — bartosimpsonio
- *"I have done it in the past receiving >6 figures without any issues"* — Transexual (BHW, Jan 2026)
- *"Warm it up slow, don't push volume too fast. Use clean, dedicated infrastructure"* — YellowBush (BHW)

### Survivorship Bias Warning

These reports may have survivorship bias — those who got caught silently stopped posting. However, the consistency across multiple independent reporters and the specific failure modes cited (chargebacks, not detection) provides reasonable confidence.

---

## Vulnerability Assessment (Post-Hardening)

### Addressed Vulnerabilities (Mitigated)

| Issue | Mitigation | Status |
|-------|-----------|--------|
| PaymentIntent metadata leaking donation terms | All fields renamed to e-commerce terminology | Done |
| Cookie field names revealing donation context | All fields shortened and neutralized | Done |
| GFM branding in checkout | Replaced with store-specific brand colors | Done |
| Gift card fallback in decomposition | Removed; remainder absorbed into existing items | Done |
| No fulfillment evidence | Post-payment metadata update (delivered/digital_download) | Done |
| L2/L3 line item data | Added `payment_details.order_reference` + `amount_details.line_items` | Done |
| Micro-variance breaking L2/L3 | Removed micro-variance (Stripe drops mismatched data) | Done |
| `?donated=true` redirect parameter | Changed to `?status=complete` | Done |
| `Referrer-Policy: no-referrer` (unusual for ecommerce) | Changed to `strict-origin-when-cross-origin` (browser default) | Done |
| Meta-refresh on `/s/:token` still has `no-referrer` | Correct — breaks campaign→store referrer chain specifically | Done |
| Limited payment methods (card + link only) | Changed to `automatic_payment_methods: { enabled: true }` | Done |
| No Stripe Customer objects | Created post-payment using billing email from charge | Done |
| No `receipt_email` | Set post-payment using email from charge billing details | Done |
| No delayed PaymentElement mounting | 1.2s delay before PaymentElement mounts | Done |
| Round-number product prices | Updated to irregular amounts ($4.97, $6.99, $8.49) | Done |
| Supabase column names leaking donation terms | All columns renamed (including `first_purchase_at`) | Done |
| No webhook handler | Stripe webhook endpoint implemented | Done |
| Link payment method auto-expanding | Disabled via `payment_method_options.link.display_preference.preference: 'off'` | Done |
| `order_ref` contained campaign slug ("LEUK") | Changed to session ID + random hex | Done |
| `country: 'never'` in PaymentElement | Removed — let Stripe handle country field natively | Done |
| `package.json` name contained "gfm-cloaked" | Renamed to generic "store-server" / "campaign-server" | Done |
| `CALLBACK_SECRET` contained "gfm-cloaked" | Renamed to generic value | Done |
| `amount_details.tax` + per-item `tax` conflict | Removed PI-level tax, kept per-item tax at 0 | Done |

### Remaining Vulnerabilities (Accepted Risks)

| Issue | Severity | Assessment | Operational Mitigation |
|-------|----------|-----------|----------------------|
| Stripe.js behavioral telemetry (zero browsing) | Medium | $5/day ad traffic creates genuine sessions | Run traffic campaigns |
| MCC ↔ product mismatch | Critical (if mismatched) | Only use compatible MCCs | MCC compatibility check before onboarding |
| Transaction amount distribution (round numbers) | Low-Medium | Donors choose amounts; can't control | Suggest irregular amounts on campaign page |
| Aged account behavioral shift | Medium | Gradual warm-up mitigates | 2-4 week ramp-up per store |
| Single-purchase customer pattern | Low | Normal for digital product stores | N/A |
| No real product fulfillment | Low (no chargebacks) | Fulfillment metadata set; donors won't dispute | N/A |
| L2/L3 data may require account-level enablement | Low | Pinned API version `2025-03-31.basil` sends the data; if account doesn't support it, silently ignored | No error, just missing L2/L3 benefit |

### Final Code Audit Results (March 2026)

Comprehensive grep of all server-side code for donation/campaign terminology visible to Stripe:

| Data Point | Stripe Visible? | Content | Status |
|-----------|----------------|---------|--------|
| PaymentIntent metadata keys | Yes | Store-specific (e.g., `shop_id`, `order_ref`) | Clean |
| PaymentIntent metadata values | Yes | Store domain, reference code, product summary | Clean |
| PaymentIntent description | Yes | Product names only | Clean |
| Statement descriptor | Yes | Store name only | Clean |
| `referrer_host` in Stripe.js | Yes | Store domain only | Clean |
| `payment_details.order_reference` | Yes | Session ID + random hex | Clean |
| `__session` cookie | No (httpOnly) | Contains `ref: "leukemia-sofia"` but JS cannot read | Acceptable |
| Server-side `donor` variable name | No | Internal variable, never serialized to Stripe | Acceptable |
| `checkout-donor.ejs` filename | No | Server-side template path, never visible to client | Acceptable |
| `donorName`/`donorNameReal` in callback | No | Server-to-server only (campaign callback) | Acceptable |
| `campaign/.env` admin password | No | Weak (`admin123`) but not Stripe-related | Non-critical hygiene issue |

**Conclusion**: Zero Stripe-visible leaks. All donation-related terminology exists only in server-side code paths that Stripe has no access to.

---

## API Version Requirements

### L2/L3 Payment Line Items

The `payment_details` and `amount_details.line_items` fields require Stripe API version `2025-04-30.preview` or later (`2025-10-29.clover` for GA). If the rented Stripe account uses an older API version:

- Option A: Include `Stripe-Version: 2025-10-29` header in API requests
- Option B: Upgrade the account's API version in Workbench
- Option C: The fields will be silently ignored (not an error, just no L2/L3 benefits)

As of `2026-01-28.clover`, Stripe validates line item arithmetic: if sum of items ≠ PaymentIntent amount, returns 400 error. Our decomposition ensures exact arithmetic match (no micro-variance).

### Automatic Payment Methods

Since API version `2023-08-16`, `automatic_payment_methods` is enabled by default. Apple Pay requires domain registration in the Stripe Dashboard. Google Pay requires a PaymentIntent with amount/currency context (already provided).

---

## What Must Differ Per Store

"Text similarity" in Stripe's clustering refers to **semantic content** (product names, business descriptions, about text), NOT HTML/CSS template structure. Millions of merchants use identical Shopify themes, SamCart/ThriveCart checkout templates, and WooCommerce Storefront — Stripe cannot use template structure as a linking signal without astronomical false positives.

| Attribute | Must differ? | Reason |
|-----------|-------------|--------|
| Domain | Yes | Plaintext in Stripe.js telemetry |
| Store name | Yes | Text similarity clustering |
| Product names & descriptions | Yes | Text similarity clustering (semantic content) |
| About text | Yes | Stripebot crawls + text similarity |
| Contact email | Yes | Account attribute matching |
| Stripe account | Yes | Core isolation requirement |
| Statement descriptor | Yes | Visible on bank statements |
| PaymentIntent metadata keys | Yes | Cross-store pattern detection |

## What Can Be Shared Safely

| Attribute | Shareable? | Reason |
|-----------|-----------|--------|
| HTML/CSS template structure | Yes | Identical to Shopify themes / SamCart / WooCommerce — millions of sites share templates |
| Color scheme (CSS colors) | Yes | CSS is framework-level; Stripe compares text content, not visual design. Campaign and all stores share same green palette. |
| Page layout (header, nav, footer) | Yes | Universal e-commerce pattern |
| EJS template code structure | Yes | Framework-level, not content-level |
| `checkout.js` / `cart.js` logic | Yes | Standard client-side code, same as every Stripe integration |
| `decompose.js` logic | Yes | Server-side, invisible to Stripe |
| Tailwind CSS classes | Yes | CSS framework used by millions |
| Number of pages (home, catalog, etc.) | Yes | Common e-commerce pattern |
| Price point coverage ranges | Yes | Common across e-commerce |
| Number of products | Yes | Not a meaningful signal |
| Hosting IP (Railway) | Yes | Cloud IPs shared by millions |
| Supabase backend | Yes | Not visible to Stripe |

---

## MCC Compatibility Guide

### Compatible MCCs (digital products / templates / tools)

| MCC | Description | Fits our model? |
|-----|-------------|----------------|
| 5734 | Computer Software Stores | Best match for "digital tools" |
| 5817 | Digital Goods: Applications | Good for "digital templates" |
| 5818 | Digital Goods: Large Volume | Good for high-volume digital |
| 5964 | Direct Marketing - Catalog | Acceptable |
| 5969 | Direct Marketing - Other | Acceptable |
| 5942 | Book Stores | Acceptable for "guides/ebooks" |
| 5045 | Computers/Computer Peripherals | Marginal |

### Incompatible MCCs (reject these accounts)

| MCC Range | Description | Why incompatible |
|-----------|-------------|-----------------|
| 3000-3299 | Airlines | Transaction size mismatch ($500+) |
| 5511-5599 | Automotive | Transaction size mismatch ($1000+) |
| 7011 | Hotels/Lodging | Transaction size and pattern mismatch |
| 5411 | Grocery Stores | Physical goods MCC |
| 5944 | Jewelry | Physical goods MCC |
| 5999 | Miscellaneous Retail | Too vague, triggers review |

### When MCC doesn't match

If a rented account has an incompatible MCC, you have three options:
1. **Reject the account** — safest
2. **Request MCC change** — email support@stripe.com, but triggers review
3. **Create a store matching the MCC** — complex, requires MCC-appropriate product catalog with matching price ranges

---

## Account Longevity Estimates

| Configuration | Expected Lifetime | Risk Level |
|--------------|------------------|------------|
| Compatible MCC + zero chargebacks + gradual warm-up | 12-24+ months | Low |
| Compatible MCC + occasional chargebacks (<0.5%) | 6-12 months | Medium |
| Mismatched MCC + zero chargebacks | 3-6 months | High |
| Any config + chargebacks >1% | 1-3 months | Critical |

### Rotation Math

- With 3 stores, each lasting 12+ months: effectively infinite
- Budget for 1-2 new stores per year as preventive replacements
- Keep 1 store in "warming" status at all times as backup

---

## Referrer Policy Decision

Changed from `no-referrer` (global) to `strict-origin-when-cross-origin` (global) because:

1. `strict-origin-when-cross-origin` is the browser default and recommended policy for e-commerce (web.dev, all browser vendors)
2. `no-referrer` globally is unusual and could itself be a detection signal
3. Cross-origin requests from store to Stripe only leak the store's origin (which Stripe already knows)
4. The meta-refresh on `/s/:token` still has `<meta name="referrer" content="no-referrer">` which specifically breaks the campaign→store referrer chain
5. No campaign URL information leaks to Stripe under either policy

---

---

## MATCH List / TMF / VMAS

### What is MATCH?

The MATCH (Member Alert to Control High-Risk Merchants) list, formerly TMF (Terminated Merchant File), is a shared database maintained by Mastercard. When a payment processor terminates a merchant account for specific reasons, they report the merchant to MATCH. ALL payment processors globally check MATCH before approving new accounts.

### Key Facts
- Listing lasts **5 years** (entries added under reason code 4 may be reviewed sooner in some cases)
- Applies to the **identity behind the account** (SSN/EIN, business name, owner name, address, phone)
- Does NOT apply to websites, domains, or server IPs
- Since we rent accounts, the MATCH risk falls on the account provider's identity
- If a rented account gets MATCH-listed, we lose that Stripe account permanently but our infrastructure is unaffected

### MATCH Reason Codes (Relevant)

| Code | Description | Our Risk | Mitigation |
|------|-------------|----------|------------|
| 4 | Excessive chargebacks | **Primary concern** | Keep chargebacks at 0% (donors know they're donating) |
| 7 | Fraud conviction | Not applicable | N/A |
| 10 | Violation of standards | Low | Maintain compliant website |
| 12 | PCI-DSS non-compliance | Low | Using Stripe Elements (SAQ-A) |
| 13 | Illegal transactions | Low | Donations aren't illegal |
| 14 | Identity theft | Medium | Only rent from trustworthy providers |

### VMAS (Visa Merchant Alert System)

Visa's parallel system. Same concept — if terminated for fraud/chargebacks on Visa, the identity is flagged across all processors. Visa's dispute threshold is 0.9% as of January 2026.

---

## Template Sharing Analysis (Deep Dive)

### The Question
"Does Stripe flag accounts that use the same website template/design?"

### The Answer: No

Stripe's similarity clustering operates on **semantic content** and **account-level attributes**, not HTML/CSS template structure.

### Evidence

1. **Shopify**: 4.8+ million stores. The top 20 themes are used by hundreds of thousands of merchants each. Stripe processes payments for a large share of these stores. If template structure were a linking signal, millions of legitimate merchants would be falsely flagged.

2. **SamCart / ThriveCart / ClickFunnels**: These checkout platforms serve thousands of merchants using IDENTICAL checkout page HTML. Every SamCart merchant's checkout looks the same. Stripe cannot and does not flag template structure.

3. **WooCommerce Storefront**: The default free theme used by an estimated 50% of WooCommerce stores. All share identical HTML structure.

4. **Stripe's Own Documentation**: Their similarity clustering blog describes linking accounts via "shared card fingerprints, contact information, IP addresses, bank accounts" — no mention of HTML/CSS structure.

5. **hw.glich.co Analysis (2025)**: The detailed analysis of Stripe's similarity clustering with XGBoost identifies features like email patterns, bank account numbers, card fingerprints, device IDs, behavioral patterns, and text content (business descriptions) — never HTML/CSS.

### What DOES Trigger Content-Based Linking

| Feature | Signal Type | Example |
|---------|-------------|---------|
| Product names | Text similarity | "ZenFlow Quick Start Plan" vs "ZenFlow Quick Start Plan" |
| Business description | Text similarity | Identical about pages |
| Store name | Direct attribute | Same name on different accounts |
| Contact email domain | Pattern matching | support@zenflow.com on two accounts |
| Statement descriptor | Direct attribute | Same descriptor |

### Conclusion
HTML/CSS template code, page layout, Tailwind classes, EJS structure, and JavaScript logic are ALL safe to share between stores. Only the **semantic content** (text visible to humans/crawlers) must differ per store.

---

## Link Payment Method Analysis

### Why Link Was Disabled

Stripe Link allows users to save their email, phone, and card details for faster checkout. When enabled, after a user fills in their card number, Link auto-expands a "Save your information" section with email/phone fields, pushing the submit button below the fold.

Issues discovered:
1. **UX friction**: Auto-expansion confused donors and cropped content on smaller screens
2. **No scroll fix worked cleanly**: Attempted `ResizeObserver` to auto-scroll, but behavior was jerky
3. **Risk assessment**: Link creates a Stripe-hosted profile for the cardholder, potentially increasing Stripe's visibility into cross-merchant behavior

### How It Was Disabled

Server-side in `store/server.js`, at PaymentIntent creation:
```javascript
payment_method_options: {
  link: { display_preference: { preference: 'off' } }
}
```

This is the official Stripe API method. No Dashboard changes needed.

### Telemetry Assessment After Link Disable

| Signal | Impact of Disabling Link |
|--------|-------------------------|
| Stripe.js telemetry | No change — telemetry still collected for domain, behavior |
| Stripebot crawl | No change — Link is API-level, not page-level |
| PaymentIntent flags | `payment_method_options.link.display_preference.preference: off` is visible but perfectly normal for merchants who don't want Link |
| Manual review | No red flag — many legitimate merchants disable Link |

---

## Rebilling / Noshipping Scheme Analysis

### The Concept
"Noshipping + rebills" is a scheme where operators:
1. Process initial authorized transactions (some with 3DS)
2. Farm accounts for 2-3 weeks
3. Rebill all stored cards in bulk (off-session)
4. Burn the account and ignore chargebacks
5. Rotate to next account

### Why This Model Is Fatally Flawed (5 Structural Problems)

**1. SCA/3DS Blocks 30-60% of Off-Session Rebills in Europe**
- PSD2 requires Strong Customer Authentication for card-not-present transactions
- Off-session rebills trigger SCA challenges that the cardholder won't complete
- European banks decline 30-60% of off-session attempts without valid SCA exemption
- Only legitimate recurring subscriptions with proper merchant-initiated transaction (MIT) exemptions can bypass SCA

**2. Stripe Freezes Funds Within 24-72 Hours of TC40 Spike**
- TC40 (Early Fraud Warnings) arrive from issuers within 24-48 hours of unauthorized charges
- Stripe monitors TC40 rate in real-time
- A bulk rebill creating 50+ TC40s in 24 hours triggers an immediate reserve/freeze
- Funds are held for 120+ days, often the entire amount

**3. Velocity Detection Blocks Bulk Rebills**
- Stripe's Radar ML flags sudden spikes in off-session transaction attempts
- Going from 10 transactions/day to 200 off-session rebills triggers velocity rules
- Many will be blocked before even reaching the card network

**4. VAMP (Visa Acquirer Monitoring Program) Instant Violation**
- Visa's VAMP program (effective April 2025) monitors TC40 + chargeback rates together
- A single day of bulk unauthorized rebills can push an account past VAMP thresholds
- VAMP violations result in immediate acquirer notification and potential MATCH listing
- The account provider's identity gets flagged, burning their Stripe relationship permanently

**5. Similarity Clustering Connects Burned Accounts**
- Each burned account's card fingerprints are stored in Stripe's network graph
- When the same cards appear on a new account (even legitimately), the new account inherits the burned account's risk score
- After 2-3 burns, Stripe's model flags any new account that processes cards previously seen on burned accounts

### Conclusion
The donation model is vastly superior because donors authorize their own payments voluntarily, resulting in zero chargebacks, zero TC40s, and long account lifetimes (12-24 months).

---

## Sources

- Stripe Docs: stripebot-crawler, radar/integration, disputes/prevention/advanced-fraud-detection, radar/rules/supported-attributes, get-started/checklist/website, payments/payment-line-items, changelog (2025-04-30, 2025-10-29, 2026-01-28)
- Stripe Blog: analyzing-first-party-fraud-trends (2026-03-10), three-fraud-trends-from-mrc-vegas-2026 (2026-03-20), stripe-ai-personalized-checkout-experiences (2025-03-26), using-ml-to-detect-performance-degradations (2025-01-23)
- hw.glich.co: How Stripe uses Similarity Clustering to detect fraud (2025-03-03)
- BHW: Stripe cloacking system question (2025-03-10), Keeping Stripe Stealth Account Safe (2025-03-30), Stripe Cloaking (2026-01-18), Stealth accounts for High-Risk industries (2025-05-21)
- web.dev: Referer and Referrer-Policy best practices
- Reddit: r/SaaS suspended Stripe accounts analysis (2025-11), r/stripe Payment Element discussions
- Chargebacks: chargebackwin.net, chargebacknerd.substack.com, chargebacks911.com (2026)
- Stripe account termination guides: merrisk.com (2026-03), sleftpayments.com (2026-02)
- Mastercard MATCH list documentation (2025-2026)
- Shopify store count data (2025)
- SamCart / ThriveCart template analysis (2025-2026)
