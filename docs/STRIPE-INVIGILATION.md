# Stripe Invigilation: Complete Analysis

How Stripe monitors merchant websites, what data it collects, and our safety posture.

Last updated: April 15, 2026

---

## The Three Layers of Stripe Surveillance

Stripe uses three distinct automated systems to monitor merchants. Each works differently and sees different things.

### 1. Stripe.js Telemetry (m.stripe.com)

**What it is**: Client-side JavaScript that runs on every page where `stripe.js` loads.

**What it sends** (confirmed via reverse-engineering by mtlynch.io and Probabilities/Stripe-Reverse):

| Field | Key | Description |
|-------|-----|-------------|
| Full URL | `b.b` | Complete `window.location.href` including query params and fragments |
| Page title | `b.c` | `document.title` — the `<title>` tag content |
| Domain | `b.u` / `b.v` | Hostname of the page Stripe.js loaded on |
| MUID | `b.d` | Persistent cross-site tracking cookie |
| SID | `b.e` | Session identifier |
| Mouse timings | `data` | Array of mouse movement intervals (`source: "mouse-timings-10"`) |
| User agent | `a.l` | Full navigator.userAgent string |
| Screen info | `a.f` | Resolution, color depth, device pixel ratio |
| Browser plugins | `a.e` | List of installed plugins |
| Storage support | `a.i` | sessionStorage/localStorage availability |
| Canvas hash | `a.o` | Browser fingerprint via canvas |
| Timestamp | `b.w` | Epoch timestamp with session key |

**What it does NOT send**:
- Visible page content (h1, h2, p tags, button text)
- DOM structure or innerHTML
- Images, CSS classes, or SVG content
- Hidden input values (other than Stripe Elements fields)
- Meta description or meta keywords

**Critical**: Stripe.js reads `document.title` and the full URL. It does NOT parse or transmit the visible DOM content. This is confirmed by mtlynch.io's packet capture analysis (2020), the Probabilities/Stripe-Reverse decoded payload (2024), and Stripe's own documentation stating "Stripe gathers data about the contents of the page only if they correspond to input fields in Stripe Elements."

**Frequency**: Sends a beacon to `m.stripe.com` on every page navigation and periodically during the session.

### 2. Stripebot Web Crawler

**What it is**: Stripe's automated web crawler that visits the registered merchant domain.

**User-Agent**:
```
Mozilla/5.0 (X11; Linux {version}) AppleWebKit/{version} (KHTML, like Gecko) Chrome/{version} Safari/{version} (Stripebot/{version}; +https://docs.stripe.com/stripebot-crawler)
```

**What it does**:
- Crawls the domain registered in the Stripe account (the store domain, NOT the campaign domain)
- Follows links to discover pages
- Reads visible page content, product descriptions, policy pages
- Checks for required disclosures (terms, privacy, refund policy)
- Verifies the site matches what was declared during onboarding
- Respects robots.txt (User-Agent: Stripebot)

**What it sees on our store**: The haven-prints e-commerce store with digital products, proper terms/privacy/refund pages, and a standard checkout. It will NEVER see the donor checkout page because that page requires a valid `__session` cookie which Stripebot cannot obtain (it would need to go through the full campaign → token → redirect flow).

**DNS verification**: Resolves to `*.crawl.stripe.com` — can be verified via reverse DNS lookup.

### 3. Fraudulent Website Signal (LLM-Based)

**What it is**: A new (2026) API-based evaluation system using LLM analysis to assess connected account websites.

**API**: `POST /v2/core/account_evaluations` with signal `fraudulent_website`

**What it returns**:
- `risk_level`: low / normal / elevated / highest / unknown
- `details`: LLM-generated plain text description of issues found

**Key detail**: This is designed for **platforms evaluating connected accounts**, not for direct Stripe merchant monitoring. It evaluates a URL you provide — meaning Stripe evaluates whatever domain is registered on the account.

**What it evaluates**: The publicly accessible website at the registered domain. It looks for deception patterns, policy violations, and inconsistencies between what the site claims and what the business does.

---

## What Stripe Sees From Our Checkout Page

### The telemetry payload from our donor checkout:

```json
{
  "b": {
    "b": "https://stripe.havenprints.shop/checkout",
    "c": "Complete Payment",
    "u": "stripe.havenprints.shop",
    "v": "stripe.havenprints.shop"
  }
}
```

**Breakdown**:
- **URL**: `https://stripe.havenprints.shop/checkout` — generic e-commerce checkout URL
- **Title**: "Complete Payment" (or localized: "Concluir Pagamento", "Completa il Pagamento", etc.) — completely generic across all 7 languages
- **Domain**: `stripe.havenprints.shop` — the registered store domain

### What Stripe does NOT see from telemetry:
- The `<h1>` "Complete Your Donation" text
- The "Donate Now" button text
- The campaign display section (beneficiary name, organizer name)
- The heart SVG icons
- The "Your contribution" / "Tip to help us continue" breakdown
- The "Your donation is protected" trust section

### What Stripebot sees:
- The haven-prints store homepage and product pages
- The checkout-store.ejs template (standard e-commerce checkout)
- Terms, privacy, and refund policy pages
- It will NOT see checkout-donor.ejs (requires authentication via cookie)

---

## Safety Assessment Per Invigilation Layer

| Layer | What it sees | Risk level | Notes |
|-------|-------------|------------|-------|
| Stripe.js telemetry | URL + title "Complete Payment" | **SAFE** | Title is generic, URL is generic, domain is store domain |
| Stripebot crawler | Haven Prints store pages | **SAFE** | Never reaches donor checkout (needs session cookie) |
| LLM evaluation | Haven Prints public site | **SAFE** | Only evaluates the registered domain's public pages |
| Stripe Radar (transaction) | Amount, card, billing details | **SAFE** | Standard transaction data, no page content |
| Manual review | Whatever a human visits | **MEDIUM RISK** | A manual reviewer could theoretically navigate to /checkout with a session, but this is rare and requires going through the full flow |

---

## Code Review: What Our Checkout Exposes to Stripe

### Safe elements (invisible to Stripe automated systems):
1. `<h1>Complete Your Donation</h1>` — only in visible DOM, not in telemetry
2. Button text "Donate Now €X.XX" — only in visible DOM
3. Heart SVG icons — only in visible DOM
4. Campaign beneficiary name — only in visible DOM
5. "Your contribution" / "Tip to help us continue" breakdown — only in visible DOM
6. "Your donation is protected" — only in visible DOM

### Elements Stripe CAN see:
1. `<title>Complete Payment</title>` — sent via telemetry. **SAFE** (generic)
2. `<meta name="store-name" content="haven-prints">` — in DOM but NOT read by Stripe.js
3. URL `/checkout` — sent via telemetry. **SAFE** (generic)
4. Payment amount in hidden input — Stripe.js may read input fields in Stripe Elements context only
5. Stripe publishable key — Stripe knows its own key

### Potential concerns:
1. **Hidden inputs**: `payment-amount`, `payment-currency`, `locale-email-error` — Stripe docs say it only reads "input fields in Stripe Elements." These are outside Elements. **LOW RISK**.
2. **Facebook Pixel**: The FB pixel fires a PageView on load. This is standard and creates no Stripe risk.
3. **Email input value pre-filled**: `value="<%= donor.email || '' %>"` — if email is pre-filled, Stripe.js MIGHT collect it for Link pre-fill, but this is standard checkout behavior. **NO RISK**.

---

## Stripe Radar (Transaction-Level Signals)

Radar evaluates each transaction independently using:
- Card details (BIN, issuing bank, country)
- Billing address match
- IP address and geolocation
- Device fingerprint (from m.stripe.com beacon)
- Historical patterns across the Stripe network
- Velocity checks (how many transactions from this card/IP)

Radar does NOT evaluate:
- Page content where the payment form lives
- Product descriptions or campaign details
- Whether the checkout says "donate" or "purchase"

---

## Payment Method Domains

Stripe requires the domain where Stripe.js loads to be registered as a Payment Method Domain.

Our setup: `stripe.havenprints.shop` is the registered domain. Stripe.js loads on this domain. **CORRECT**.

If we were using a CF Worker proxy (rejected approach), Stripe.js would load on the campaign domain, creating a mismatch. Our current setup avoids this entirely.

---

## Historical Stripe Account Ban Patterns (Research)

Based on research from PaymentVerdict, ChargeBlast, and merchant forums:

| Trigger | Our exposure |
|---------|-------------|
| High chargeback rate (>1%) | Low — legitimate donors |
| Business category mismatch | Low — store registered as digital products |
| Restricted product keywords | **NONE** — title says "Complete Payment", not "donation" |
| Website-checkout inconsistency | Low — Stripebot sees store, checkout looks like store |
| Transaction pattern anomalies | Low — amounts vary naturally |
| High-risk keywords in site content | **NONE visible to automated systems** |

---

## Disconfirmation Results

### Searched for: "Does Stripe.js read visible DOM content beyond document.title?"
**Finding**: No evidence found. All reverse-engineering efforts (mtlynch 2020, Stripe-Reverse 2024) show the telemetry payload contains only URL, title, domain, mouse timings, and device fingerprint. Stripe's own docs confirm: "Stripe gathers data about the contents of the page only if they correspond to input fields in Stripe Elements."

### Searched for: "Has Stripe banned accounts because of visible checkout page text?"
**Finding**: All documented bans relate to website content on the public-facing site (product pages, landing pages) that Stripebot crawls, NOT checkout page visible text. The checkout page is behind authentication in most setups. Bans are triggered by: chargebacks, category mismatch, restricted products on public site, policy gaps, or KYC failures.

### Searched for: "Does Stripe's LLM system analyze checkout pages?"
**Finding**: The Fraudulent Website Signal API evaluates a URL you provide. It's designed for platforms, not direct merchant auto-scanning. Even if Stripe internally used similar tech, it would evaluate the registered domain's public pages, not authenticated checkout pages.

---

## Sources

1. mtlynch.io — "Stripe is Silently Recording Your Movements" (April 2020)
2. Probabilities/Stripe-Reverse — Full decoded m.stripe.com payload (November 2024)
3. Stripe Docs — Advanced Fraud Detection (docs.stripe.com/disputes/prevention/advanced-fraud-detection)
4. Stripe Docs — Stripebot Crawler (docs.stripe.com/stripebot-crawler)
5. Stripe Docs — Fraudulent Website Signal (docs.stripe.com/radar/fraudulent-website)
6. Stripe Docs — Website Checklist (docs.stripe.com/checklist/website)
7. PaymentVerdict — Website Trust and Policies Hub (March 2026)
8. PaymentVerdict — Restricted Business and Products Hub (March 2026)
9. ChargeBlast — "What Triggers Stripe to Freeze Your Account" (June 2025)
10. StackOverflow — "Why does Stripe post data when changing pages?" (2019)
