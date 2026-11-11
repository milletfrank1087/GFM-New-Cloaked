# Rules for AI agents working in this repo

## Live Stripe: never call it

**Never send any request to a live Stripe account** — no reads, no writes, no "just listing" — from scripts, the Stripe CLI, `node -e`, curl, or the Stripe dashboard API. This covers every `sk_live_…` / `rk_live_…` key (the stores' Railway variables hold them).

- **Having the keys locally is fine.** You may read Railway variables (including `STRIPE_SECRET_KEY` and other live Stripe keys) and keep them in a local `.env` or the Railway CLI. The rule is about *using* them: never use any live key to send a request to Stripe (API, CLI, SDK, curl, `node -e`, dashboard API).
- Keep keys out of git and out of chat/log output (don't commit them, don't paste their values into replies).
- Do not create/modify webhook endpoints, customers, subscriptions, refunds or anything else on a live account.
- If a task seems to need live Stripe data, stop and ask the user to do it in the Stripe dashboard.

Allowed data sources for investigation:
- **Supabase** (payments, subscriptions, customers, checkout_sessions, funnel_events, payment_failures, ad_spend)
- **Railway / Zeabur** logs, deployments and variables (Stripe secrets may be read and held locally, but never used to call Stripe)
- **Meta / Facebook** Graph API **read** endpoints (ads, insights, pixel stats, activities)
- **Stripe test mode** (`sk_test_…` in `store/.env`) for local testing only

Local test runs write to the production Supabase: mark/clean up test rows afterwards.

## Meta / Facebook Ads API: never bulk-create or auto-activate

Unthrottled Graph API write bursts (`POST /campaigns`, `/adsets`, `/adcreatives`, `/ads`) and creating objects with `status: "ACTIVE"` on a cold (`$0`-spend) ad account will immediately trigger Meta's automated anti-hijack / integrity ban (`disable_reason: 1`).

1. **No burst writes or bulk cloning:** Never run a loop that creates multiple campaigns, ad sets, creatives, or ads back-to-back via the Graph API, MCP tools, `node -e`, or curl.
2. **Never create with `status: "ACTIVE"`:** All campaigns, ad sets, and ads must be created in **`PAUSED`** state (`status: "PAUSED"`). Never toggle a newly created campaign to `ACTIVE` via API — let the user activate it manually in Ads Manager (`Power Editor`) after review completes.
3. **Cold (`$0`-spend) ad accounts:** Never create more than **1 warmup campaign (`$25–$50/day`, `PAUSED`)** on a `$0`-spend ad account, and enforce at least **15–30 seconds** of delay between individual write `POST` requests.
4. **Check for security checkpoints first (`error_code: 3858385`):** Before any Meta write call, inspect `issues_info` / `activities`. If the user profile or any ad has `error_code: 3858385` (*"Please authenticate your account"*), **stop immediately and do not send any write requests** until the user completes authentication in Ads Manager. Prefer a Business System User token (`FB_SYSTEM_USER_ACCESS_TOKEN`) over a personal user token (`FB_USER_ACCESS_TOKEN`) for API mutations.

## Meta pixel: restricted-host bypass

Meta silently "prohibits" the pixel on some hostnames (`blockReason: "source_category"` — it classifies the landing page as sensitive health data). On such a host the config script it serves is a restricted variant: ~205 KB instead of ~605 KB, with `"lockWebpage":true`, `restrictedEventNames: ["AddPaymentInfo","AddToCart","InitiateCheckout","Purchase"]`, and `content_name` on the sensitive-key list. Result: every `fbq()` call is queued and never sent, Landing Page Views read 0, and the host looks dead while paid traffic keeps arriving.

Never "fix" this by hand-editing beacons — `campaign/public/js/meta-unlock.js` is injected after `fbq('init')` in `routes/pages.js` and handles it: it opts the pixel out of the four gating plugins, releases the lock, and trims queued params. It is loaded on every campaign page and is a no-op on clean hosts.

- **Check a host** with `GET https://connect.facebook.net/signals/config/<pixelId>?domain=<host>` — ~605 KB and no `lockWebpage` means clean.
- **Do not remove the module** or move it before `fbq('init')`; it needs the pixel registered and the config loaded.
- `CAPI_SOURCE_DOMAIN` overrides `event_source_url` for CAPI only (`lib/tracking/meta.js`). `www.impactmetrics.online` is the clean fallback domain service.
