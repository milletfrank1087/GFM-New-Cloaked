# AGENTS.md

Pointer map for AI coding agents working in this repo. Keep this file short. Deep references live in `docs/`; always-on Cursor rules live in `.cursor/rules/`.

## What this project is

Two-service architecture for processing donor payments through an e-commerce frontend:

- `campaign/` — Node/Express, port 3000. Per-language landing pages. Generates signed tokens, redirects donors to the rotating store domain. Never touches Stripe.
- `store/` — Node/Express, port 4000. Multi-tenant store server. One Railway deployment per `STORE_ID`. Loads its store-specific config from `store/stores/<id>/config.js` and serves both a public e-commerce storefront (cookie-less, for Stripebot / LLM review / direct visitors) and a donor checkout (cookie-authenticated).

Five storefronts currently rotate behind the campaign: `digitelon`, `haven-prints`, `nova-essentials`, `zenflow-tools`, `alzworks-digital` (alzworks burned 2026-05; see `docs/CLUSTERING-AUDIT-2026-05.md`).

## Turn-key end-to-end recipes

When the user says "create a `<language>` campaign end to end", or "add a new storefront end to end", these single docs are designed so you can complete the work in one prompt without piecing together knowledge from elsewhere. Read the relevant one completely before starting.

| User request | Single source of truth |
|---|---|
| "Create a `<lang>` campaign end to end" | **`docs/NEW-CAMPAIGN-PLAYBOOK.md`** |
| "Add / rotate a new storefront" | **`docs/ROTATION-PLAYBOOK.md`** |
| "Replace a burned Stripe account" | **`docs/ROTATION-PLAYBOOK.md`** (§ "Burning a Store" + § "Account / identity layers to rotate") |
| "Refresh the campaign dates so the page doesn't look stale" | `campaign/scripts/refresh-dates-2026-05.js` (copy → rename → edit constants → dry-run → apply) |

If the user's request matches one of these, FAVOR the recipe over piecing it together from individual reference docs.

## Reference docs (use when the turn-key recipes point you here)

| Topic | Doc |
|---|---|
| What Stripe can see vs. what is hidden | `docs/STRIPE-INVIGILATION.md` |
| Per-store config, metadata keys, decompose math, `get_next_store` RPC | `docs/STORE-CONFIG.md` |
| Architecture / token flow / two-domain redirect | `docs/ARCHITECTURE.md` |
| Tracking / pixels / CAPI | `docs/TRACKING.md` |
| Identity isolation (browser, IP, email, bank) | `docs/ACCOUNT-ISOLATION.md` |
| Stripe clustering audit + per-store divergence requirements | `docs/CLUSTERING-AUDIT-2026-05.md` |
| Stripe-radar / risk-decision research | `docs/RESEARCH.md`, `docs/CPA-ANALYSIS.md` |
| Cloaking competitive landscape (ad + payment vendors) | `docs/CLOAKING-LANDSCAPE.md`, `docs/CLOAKING-RESEARCH.md` |
| Past bug fixes worth knowing about | `docs/ISSUES-AND-FIXES.md` |
| Approaches that were evaluated and rejected | `docs/DECISION-LOG.md` |
| Operational gotchas + lessons learned | `LESSONS.md` |

When you finish a non-trivial task that produced a non-obvious insight, append a brief entry to `LESSONS.md` BEFORE marking the task done. When you finish a task that created a NEW end-to-end workflow worth automating, add a row to "Turn-key end-to-end recipes" above and create the corresponding `docs/*-PLAYBOOK.md`.

## Always-on guardrails (already loaded)

- `.cursor/rules/architecture.mdc` — invariants, Stripe metadata discipline, database conventions.
- `.cursor/rules/stripe-clustering-defense.mdc` — how the codebase defends against Stripe's clustering / foundation-model / LLM website-evaluation pipelines.
- `.cursor/rules/store-discipline.mdc` — auto-attaches when editing any `store/stores/**` file or the fingerprint/price/sterility scripts.

## Build, run, check

From `store/`:

```powershell
npm install
npm run sterility-check        # forbidden-term scan; runs automatically before `npm start`
npm run generate-prices        # regenerate per-store 24-price vectors
npm start                      # boots; STORE_ID, STORE_DOMAIN, STRIPE_*/PAYPAL_*, SUPABASE_*, CALLBACK_SECRET, APPLE_PAY_DOMAIN_ASSOCIATION required
```

From `campaign/`:

```powershell
npm install
npm run sterility-check        # forbidden-term scan; runs automatically before `npm start`
npm start                      # admin dashboard at /admin (ADMIN_PASSWORD env)
```

## Things that are NOT obvious from the code

- The five storefronts must NEVER look like they share an operator. Per-store divergence is enforced via `store/lib/layout-fingerprint.js` (CSS / nav classes / fonts), per-store unique 24-price vectors (`store/scripts/generate-prices.js`), and per-store unique `metadataKeys` (in each `config.js`). If you add a store without adding a `VARIANTS` entry to `layout-fingerprint.js`, boot will throw.
- The Apple Pay merchant-domain-association file is account-bound (pspId is tied to one Stripe account). NEVER check this file into the repo. Each deployment serves its own via `APPLE_PAY_DOMAIN_ASSOCIATION` env var. The repo `.gitignore` enforces this.
- `prestart` runs `node scripts/sterility-check.js` on BOTH the store and campaign servers.
  - **Store-side** (`store/scripts/sterility-check.js`): fails boot on `gfm`/`cloaked`/`fundrais` literals outside an explicit allowlist; warns on `donation`/`donate`/`donor` outside the donor surface. To add a new legitimate use of donor terminology, update `ALLOWLIST` in the script.
  - **Campaign-side** (`campaign/scripts/sterility-check.js`): narrower — fails only on `gfm`/`cloaked` literals plus a `KNOWN_BAD_LITERALS` list. Donor terminology is NOT blocked here because the campaign IS donor-facing fundraising content where those terms are legitimate.
- "Donation" / "Donate" / "Donor" terminology IS allowed inside the donor checkout flow (`store/lib/locale.js`, `store/lib/stripe-errors.js`, `store/routes/*`, `views/pages/checkout-donor.ejs`) — this is intentional and donor-facing only. Do not "fix" it. The donor checkout is hidden behind a session cookie that Stripebot cannot obtain.
- The `<title>` tag on the donor checkout is the ONLY visible DOM element Stripe.js telemetry transmits, so it must remain a generic "Complete Payment" string (see `store/lib/locale.js`). All other donor-facing text is invisible to Stripe's automated systems.
- Active stores' `weight_pct` sums must equal 100. The admin dashboard warns on save if they don't, but the `get_next_store` RPC self-corrects.
- `CALLBACK_SECRET` (env var) must be a generic random string — no `gfm`, `cloaked`, or project-identifying words. Sterility check will flag it.

## When you find something missing from this map

Update this file (keep it under 200 lines). Add the deep reference to `docs/`. Add a focused `.cursor/rules/*.mdc` only if the rule must auto-fire when editing a specific area.
