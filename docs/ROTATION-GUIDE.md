# Extreme In-Depth Rotation Guide

## Purpose

This document provides a complete, step-by-step guide on everything that must be rotated when replacing a Stripe account — whether proactively (scheduled rotation) or reactively (account burned/flagged). It covers every layer of the infrastructure stack from the Stripe account itself to the browser profile, proxy, email, bank account, domain, and code-level configuration.

---

## The Core Principle

Stripe's similarity clustering uses **account-level attributes** to link related merchant accounts. When an account is terminated, Stripe stores a fingerprint of everything associated with that account. If ANY attribute from a terminated account appears on a new account, the new account inherits the risk profile and may be flagged, restricted, or terminated immediately.

The goal of rotation is to ensure **zero overlap** between any terminated account and any new account on attributes that Stripe tracks.

---

## Complete Rotation Matrix

### Tier 1: CRITICAL (Stripe Directly Tracks These)

These are attributes that Stripe's similarity clustering actively monitors. Sharing ANY of these between a burned account and a new account is extremely high risk.

#### 1. Bank Account / Payout Destination

**Why it matters**: Bank account number is the #1 strongest signal in Stripe's similarity clustering. It is nearly impossible to fake and is the first thing Stripe checks when linking accounts.

**What to rotate**:
- The bank account connected to Stripe for payouts
- The bank account holder name (if you control it)

**How to rotate**:
- Since you rent aged accounts, the bank account is managed by the account provider
- When acquiring a new account, verify that its payout bank account has NEVER been associated with any previously terminated Stripe account
- If the account provider has multiple accounts, each one MUST use a completely different bank account
- Ideally, different banks (not just different accounts at the same bank)

**Red flags**:
- Same bank account number on two Stripe accounts → instant link
- Same bank account holder name + similar bank → probable link

---

#### 2. Stripe Account (Complete Identity)

**Why it matters**: The core identity unit that Stripe flags.

**What to rotate**:
- The entire Stripe account (pk_live, sk_live, whsec keys)
- The email address associated with the Stripe account
- The business name, address, phone number on file
- The EIN/SSN/tax ID on file

**How to rotate**:
- Rent a completely new aged account from a different provider if possible
- Verify the account email has never been associated with a terminated account
- Verify the business details (name, address, phone) are completely different

**Red flags**:
- Same email domain (e.g., two accounts both using @mybusiness.com)
- Same phone number
- Same business address
- Overlapping business name words

---

#### 3. Dashboard Access IP Address

**Why it matters**: Stripe logs every IP that accesses the Dashboard. If the same IP accesses two different Stripe accounts, Stripe can link them.

**What to rotate**:
- The residential proxy IP used to access the Stripe Dashboard

**How to rotate**:
- In NodeMaven (or your residential proxy provider), assign a **completely new sticky residential IP** to the new AdsPower profile
- The IP should be from a different subnet if possible (different /24 block)
- The IP should be from the same country as the Stripe account's business address for consistency

**Configuration**:
```
NodeMaven Proxy Setup:
- Type: Sticky Residential
- Country: Match Stripe account's country
- Session duration: Maximum available (24h+)
- Protocol: SOCKS5 preferred (better for browser fingerprinting)
```

**Red flags**:
- Same IP accessing two different Stripe Dashboards → instant link
- Same IP subnet (/24) accessing two dashboards → possible link
- Datacenter IP accessing Dashboard → unusual, may trigger review

---

#### 4. AdsPower Browser Profile (Device Fingerprint)

**Why it matters**: When you log into the Stripe Dashboard, Stripe collects a device fingerprint including browser version, screen resolution, installed fonts, GPU info, canvas fingerprint, WebGL fingerprint, and more. This fingerprint is linked to the account.

**What to rotate**:
- The entire AdsPower browser profile

**How to rotate**:
1. Open AdsPower
2. Create a **brand new profile** (do NOT clone the old one)
3. Configure the profile:
   - **OS**: Match the proxy country's common OS (Windows 10/11 for US/EU)
   - **Browser**: Chrome (latest stable version)
   - **Screen resolution**: Pick a common resolution (1920x1080, 1366x768, 1440x900)
   - **Language**: Match the Stripe account's country (en-US, de-DE, etc.)
   - **Timezone**: Match the proxy IP's timezone
   - **WebRTC**: Disabled or set to match proxy IP
   - **Canvas**: Random noise (AdsPower default)
   - **WebGL**: Random vendor/renderer
   - **Fonts**: System defaults for the chosen OS
4. Assign the new NodeMaven IP to this profile
5. Never use this profile for any other purpose

**Red flags**:
- Same canvas/WebGL fingerprint on two accounts → high-confidence link
- Cloned profile (shares many attributes) → possible link
- Timezone mismatch with IP → suspicious behavior

---

#### 5. Email Address

**Why it matters**: Email is a direct attribute that Stripe checks in similarity clustering.

**What to rotate**:
- The email used for the Stripe account login
- The support/contact email displayed on the store

**How to rotate**:
- Create a new email on a different provider
- Recommended providers: ProtonMail, Tutanota, Tuta, or dedicated domain email
- The email domain should differ from previous accounts
- Example rotation: zenflow@proton.me → nova@tutanota.com → stellar@tuta.io

**For store contact email**:
- Use a store-branded email if possible (support@storename.com)
- Or use a generic provider with the store name (storename.tools@proton.me)

**Red flags**:
- Same email domain pattern (all accounts using @proton.me with similar naming)
- Email username containing previous store names
- Same email used for multiple Stripe accounts

---

#### 6. Domain Name

**Why it matters**: The domain is sent in plaintext in Stripe.js telemetry (`referrer_host` parameter). It's directly associated with the Stripe account.

**What to rotate**:
- The store domain
- The domain registrar (bonus, not required)

**How to rotate**:
1. Purchase a new domain from any registrar (Namecheap, Porkbun, Cloudflare, GoDaddy)
2. The domain name should have NO resemblance to previous store names
3. Point DNS to the new Railway deployment
4. Register the domain for Apple Pay in the new Stripe Dashboard

**Recommended domain patterns**:
- `{storename}-{category}.com` (e.g., zenflow-tools.com, nova-essentials.com)
- `.com` preferred, `.co`, `.io`, `.store` also acceptable
- Avoid `.xyz`, `.tk`, `.ml` — these are associated with spam

**Red flags**:
- Domain name containing words from a previous store
- Domain registered by the same registrant name/address (WHOIS)
- Domain hosted on the same IP (Railway handles this — cloud IPs are shared, so this is safe)

---

#### 7. Phone Number

**Why it matters**: Stripe stores the phone number associated with the account. Phone numbers are a direct linking attribute.

**What to rotate**:
- The phone number on the Stripe account
- The phone number displayed on the store website

**How to rotate**:
- Since you rent accounts, the phone number is managed by the account provider
- Ensure each rented account has a unique phone number
- For store contact pages, use a VoIP number or display "Email only" support
- If you must display a phone: use a virtual number from a different provider per store

---

### Tier 2: IMPORTANT (Stripe Crawls / Compares These)

These are attributes that Stripebot crawls or that Stripe's text similarity clustering compares.

#### 8. Store Name & Statement Descriptor

**Why it matters**: The store name appears in Stripe metadata and the statement descriptor appears on cardholder bank statements. Both are indexed for similarity clustering.

**What to rotate**:
- Store display name
- Stripe statement descriptor (max 22 chars)
- Tagline/slogan

**How to choose a new name**:
- Pick a completely different name with no word overlap
- Keep it consistent with the MCC (digital tools/templates/software)
- Statement descriptor must match the store name
- Examples: "ZenFlow Tools" → "Nova Essentials" → "Stellar Digital" → "Peak Commerce"

---

#### 9. Product Names, Descriptions & About Text

**Why it matters**: Stripebot crawls the store website and Stripe's text similarity model compares the semantic content across accounts.

**What to rotate**:
- All product names (write completely new ones)
- All product descriptions (new wording, potentially new niche within same MCC)
- About page text (new founding story, team, mission)
- FAQ answers (same topics are fine, but different wording)
- Customer reviews (new content)
- Contact page text

**What you DON'T need to rotate** (safe to keep identical):
- HTML/CSS template structure
- Page layout (header, nav, footer structure)
- EJS template code
- JavaScript logic (checkout.js, cart.js)
- Tailwind CSS classes
- Color scheme (#00b964)
- Number of products (24)
- Number of pages
- Product price ranges

**How to write new content efficiently**:
1. Choose a sub-niche within the MCC (e.g., "business templates" → "productivity tools" → "design resources")
2. Use AI to generate product names and descriptions
3. Ensure no product name overlaps with any previous store
4. Keep prices in the same ranges (for decomposition compatibility)

---

#### 10. PaymentIntent Metadata Key Names

**Why it matters**: Stripe can compare metadata structures across accounts. If two accounts use identical metadata key names, it's a linking signal.

**What to rotate**:
- Every key name in `config.js` → `metadataKeys` object

**Current keys by store**:

| Field | ZenFlow | Nova | New Store (example) |
|-------|---------|------|-------------------|
| Store ID | `shop_id` | `vendor_id` | `merchant_id` |
| Domain | `shop_url` | `origin` | `site` |
| Reference | `order_ref` | `txn_ref` | `purchase_ref` |
| Session | `checkout_id` | `session_id` | `cart_id` |
| Subtotal | `item_total` | `base_amount` | `goods_total` |
| Fee | `processing_fee` | `platform_fee` | `handling_fee` |
| Guest | `express_checkout` | `quick_pay` | `fast_checkout` |
| Summary | `items` | `line_items` | `products` |

**How to choose**:
- Use common e-commerce terminology
- Ensure zero overlap with previous stores
- Keep names 2-3 words max

---

### Tier 3: OPERATIONAL (Not Tracked by Stripe, But Good Hygiene)

#### 11. Railway Deployment

**What to rotate**: Create a new Railway service for the new store

**How**:
1. In Railway, create a new service
2. Set environment variables (STORE_ID, Stripe keys, Supabase URL, etc.)
3. Deploy from the `store/` directory
4. Point DNS to the new Railway deployment

**Safe to keep**: The same Railway account/team (Railway is invisible to Stripe)

---

#### 12. Webhook Endpoint

**What to rotate**: The webhook URL (it's tied to the domain)

**How**:
1. In the new Stripe Dashboard, register: `https://new-store-domain.com/webhooks/stripe`
2. Copy the `STRIPE_WEBHOOK_SECRET` to the new store's `.env`
3. The old webhook URL will stop working when the old domain expires

---

#### 13. Store `.env` File

**What to rotate**: All store-specific values

```env
# ROTATE THESE:
STORE_ID=new-store-id
STORE_DOMAIN=new-store-domain.com
STRIPE_SECRET_KEY=sk_live_NEW...
STRIPE_PUBLISHABLE_KEY=pk_live_NEW...
STRIPE_WEBHOOK_SECRET=whsec_NEW...
CAMPAIGN_CALLBACK_URLS=https://el.risehope.online,https://it.risehope.online

# KEEP THESE (shared infrastructure, invisible to Stripe):
PORT=4000
SUPABASE_URL=https://wzialsfdguuircomaqvp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
CALLBACK_SECRET=store-cb-sec-8f3a2d
NODE_ENV=production
```

---

#### 14. Supabase Store Entry

**What to do**:
```sql
-- Mark old store as burned
UPDATE stores SET status = 'burned' WHERE slug = 'old-store-id';

-- Add new store
INSERT INTO stores (domain, slug, name, status, max_monthly_volume)
VALUES ('new-store.com', 'new-store-id', 'New Store Name', 'warming', 5000);
```

---

## Complete Burn & Rotate Checklist

Use this checklist every time you replace a Stripe account:

### Phase 1: Burn (Day 0)
- [ ] Set store status to `burned` in Supabase
- [ ] Stop routing traffic to this store (round-robin auto-skips)
- [ ] Stop accessing the Stripe Dashboard for this account
- [ ] Note the AdsPower profile # and NodeMaven IP to never reuse

### Phase 2: Wait (Day 0–30)
- [ ] Let pending charges settle (30-day holding period)
- [ ] Do NOT close the Stripe account during this period
- [ ] Do NOT log into the Dashboard during this period

### Phase 3: Acquire New Account (Day 1–7)
- [ ] Rent a new aged Stripe account from a (preferably different) provider
- [ ] Verify MCC is compatible (5734, 5817, 5818, 5964, 5969, 5942)
- [ ] Verify the bank account has never been on a terminated Stripe account
- [ ] Verify the account email is unique
- [ ] Verify the business details (name, address, phone) are unique

### Phase 4: Set Up New Infrastructure (Day 1–7)
- [ ] Buy a new domain (no word overlap with previous stores)
- [ ] Create a new AdsPower profile (brand new, not cloned)
- [ ] Assign a new NodeMaven sticky residential IP
- [ ] Configure AdsPower profile (OS, browser, timezone matching proxy)
- [ ] Create a new email for store contact (different provider than previous)
- [ ] Log into the new Stripe Dashboard ONLY from the new AdsPower profile
- [ ] Register Apple Pay domain in Stripe Dashboard
- [ ] Register webhook endpoint in Stripe Dashboard
- [ ] Set statement descriptor in Stripe Dashboard

### Phase 5: Set Up New Store (Day 2–7)
- [ ] Create new directory: `store/stores/{new-store-id}/`
- [ ] Copy template files from existing store (code sharing is safe)
- [ ] Write NEW `config.js`: unique name, statement descriptor, metadata keys, products
- [ ] Write NEW content for all EJS pages: about, FAQ, reviews, product descriptions
- [ ] Create new `.env` with all new Stripe keys and domain
- [ ] Create new Railway service and deploy
- [ ] Point domain DNS to new Railway deployment
- [ ] Add store to Supabase `stores` table with status `warming`

### Phase 6: Warm Up (Day 7–21)
- [ ] Process 3-5 small test transactions ($5-$20 range)
- [ ] Space transactions 1-2 days apart
- [ ] Use real cards (friends/family or low-value test purchases)
- [ ] Start running $5/day ads pointing to store homepage
- [ ] Gradually increase transaction amounts and frequency
- [ ] Monitor Stripe Dashboard for any compliance notices

### Phase 7: Go Live (Day 14–21)
- [ ] Set store status to `active` in Supabase
- [ ] Verify round-robin is routing traffic to the new store
- [ ] Run the full sterility check (see TESTING-GUIDE.md)
- [ ] Monitor first week closely for any Stripe flags

### Phase 8: Clean Up Old Account (Day 30+)
- [ ] Close the old Stripe account
- [ ] Let the old domain expire (or park it)
- [ ] Delete or archive the old AdsPower profile
- [ ] Release the old NodeMaven IP
- [ ] Optionally remove old store directory from codebase (or keep for reference)

---

## Rotation Schedule (Proactive)

Even without account burns, consider rotating proactively:

| Interval | Action |
|----------|--------|
| Every 6 months | Rotate the NodeMaven IP for each active profile (even if not burned) |
| Every 12 months | Consider proactively rotating the oldest active store |
| Continuous | Keep 1 store in "warming" status as backup |
| Weekly | Monitor chargeback rates, compliance notices, payment failure rates |

---

## What NEVER Needs to Rotate

These are safe to keep constant across all accounts and all time:

| Attribute | Why Safe |
|-----------|---------|
| Supabase database | Server-side, Stripe has no access |
| Campaign server URLs | Referrer chain is broken by meta-refresh |
| Railway account | Cloud infrastructure provider, not linked by Stripe |
| Git repository | Source code is not exposed to Stripe |
| `CALLBACK_SECRET` | Server-to-server authentication, invisible to Stripe |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database key |
| HTML/CSS template code | Millions of merchants share templates (Shopify, WooCommerce) |
| Color scheme (#00b964) | CSS is framework-level, not content-level |
| Tailwind CSS / Inter font | Used by millions of websites |
| `checkout.js` / `cart.js` logic | Standard Stripe integration code |
| `decompose.js` algorithm | Server-side, invisible to Stripe |
| Page structure (header, nav, footer) | Universal e-commerce pattern |
| Price point ranges | Common across e-commerce |
| Your personal identity | You never appear on any Stripe account — account providers handle identity |

---

## Quick Reference Card

Print this or save it for each rotation:

```
NEW ACCOUNT ROTATION QUICK REF
================================
□ New Stripe account (different provider preferred)
□ New domain (zero word overlap)
□ New AdsPower profile (fresh, not cloned)
□ New NodeMaven IP (different subnet preferred)
□ New email (different provider preferred)
□ New store name + statement descriptor
□ New product names + descriptions + about text
□ New metadata key names in config.js
□ New Railway service
□ New .env with all new keys
□ Supabase: INSERT stores + SET status = 'warming'
□ Stripe Dashboard: Apple Pay domain + webhook + descriptor
□ Warm up 2-3 weeks
□ Run sterility check (TESTING-GUIDE.md)
□ Set status = 'active'
================================
NEVER REUSE from burned account:
✗ Bank account
✗ Email address
✗ Phone number
✗ AdsPower profile
✗ NodeMaven IP
✗ Domain name
✗ Store name / product names
✗ Metadata key names
```
