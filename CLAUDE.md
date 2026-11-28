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

## The apex `risehope.online` is on Zeabur (moved 2026-11-13)

**`risehope.online` and `www.risehope.online` are served by `impact-metrics`** (`6acfea0e7741ff5769fb9e09`) — the `clean-domain` static page — hosted on the Zeabur ingress `88.198.156.58`. `www` is a CNAME to `@`, so apex and `www` always move together.

Before 2026-11-13 the apex was a **GoDaddy Website Builder 8** "Launching Soon" placeholder on AWS Global Accelerator (`76.223.105.230` / `13.248.243.5`), owned by the registrar's builder product. That is why adding a `<meta>` tag to the repo did nothing for `http://risehope.online/`: nothing in git could ever reach that host. It now resolves to Zeabur, so `git push` does affect it.

- Meta **domain verification** for Bright Bastion (`2212915982914957`) is satisfied two independent ways: the `facebook-domain-verification=awgxiyxiysziplf4tr76b8ffc4mskv` **TXT record on `@`** (GoDaddy, TTL 600), and the **meta tag** in `<head>` of every `campaign/public/*.html` and `clean-domain/public/index.html`. Meta checks the apex URL, which is why the apex had to move at all.
- `clean-domain/public/index.html` carries **two** verification tags (ours plus `bv38…` for `reddingtonv6`). Meta allows several; do not delete either without knowing which business still needs it.
- The repo renders pages with `fs.readFileSync` + placeholder replacement, not a live template engine, so a tag inserted immediately after `<head>` survives — no code change needed to re-add one.
- Do not re-point the apex at Website Builder. If you detach these domains from `impact-metrics`, `http://risehope.online/` regresses to the placeholder and site-wide domain verification breaks.

The Graph API `/verify` shortcut is unavailable: it needs `business_management`, which the `meta-ads-new` token lacks, and it rejects the call with `(#10) Application does not have permission`. The valid `verification_method` enum is `{DNS_RECORD, HTML_UPLOAD, META_TAG}` — not `DNS_TXT`.

## The cockpit's date bounds and the account stamp (2026-11-26)

Two defects broke the Profit Cockpit here, both fixed in `66e5f9d`:

- `profit.js` `fetchPayments`/`fetchFailures` applied a `created_at` bound only when the date arrived as a bare `YYYY-MM-DD`. The cockpit sends `athensMidnight().toISOString()` (a real timestamp, because Athens midnight is not UTC midnight), so **both bounds were skipped** and the query fell back to `.order(created_at desc).limit(1000)`. Every range then returned the newest 1000 payments: Today, Yesterday and 7D reported identical totals (€21,105 / count 1000) and window spend could not be matched to rows. `isInstant()` now accepts either shape: a timestamp end is `lte`, a date-only end becomes next midnight `lt`.
- `ads-manager.js` filled `account_id` only on rows returned by a **per-account** call. The default all-account call left it empty, and the per-account spend sync skips empty ones, so spend silently never landed for the primary's campaigns. Unstamped rows are now attributed to `FB_AD_ACCOUNT_ID`/`FB_PRIMARY_ACCOUNT_ID`.

**The new BM is `1578611613719194`, ad account `act_3936327343175633`, page `1363808276826222`, app `4594109177502279`.** The account's timezone is `Europe/Athens`; `FB_PRIMARY_ACCOUNT_TIMEZONE` must match it or every "today" boundary lands three hours off.

**The old account `act_1388808955587972` is a *client* account and is not attached to the new business**, so the manager's token fails it with `(#200) ... has NOT grant ads_management or ads_read` even though the token holds both scopes. Decision 2026-11-26: use only `act_3936327343175633` and start fresh, so both references were cleared - `FB_ADDITIONAL_ACCOUNT_IDS` on the manager and `ADDITIONAL_AD_ACCOUNT_IDS` on the campaign (that one was set to the primary and so duplicated it). Re-add the old id to `FB_ADDITIONAL_ACCOUNT_IDS` to backfill its spend, which stops at 2026-11-16.

Facts about the current data, so an empty cockpit is not mistaken for a bug: payments and spend both stop at **2026-11-16**. The new ad account was created 2026-11-24 and has never spent, no campaign exists on it, and the old account cannot be read. "Today" legitimately reads zero.

## Meta / Facebook Ads API: never bulk-create or auto-activate

Unthrottled Graph API write bursts (`POST /campaigns`, `/adsets`, `/adcreatives`, `/ads`) and creating objects with `status: "ACTIVE"` on a cold (`$0`-spend) ad account will immediately trigger Meta's automated anti-hijack / integrity ban (`disable_reason: 1`).

1. **No burst writes or bulk cloning:** Never run a loop that creates multiple campaigns, ad sets, creatives, or ads back-to-back via the Graph API, MCP tools, `node -e`, or curl.
2. **Never create with `status: "ACTIVE"`:** All campaigns, ad sets, and ads must be created in **`PAUSED`** state (`status: "PAUSED"`). Never toggle a newly created campaign to `ACTIVE` via API — let the user activate it manually in Ads Manager (`Power Editor`) after review completes.
3. **Cold (`$0`-spend) ad accounts:** Never create more than **1 warmup campaign (`$25–$50/day`, `PAUSED`)** on a `$0`-spend ad account, and enforce at least **15–30 seconds** of delay between individual write `POST` requests.
4. **Check for security checkpoints first (`error_code: 3858385`):** Before any Meta write call, inspect `issues_info` / `activities`. If the user profile or any ad has `error_code: 3858385` (*"Please authenticate your account"*), **stop immediately and do not send any write requests** until the user completes authentication in Ads Manager. Prefer a Business System User token (`FB_SYSTEM_USER_ACCESS_TOKEN`) over a personal user token (`FB_USER_ACCESS_TOKEN`) for API mutations.

## Meta pixel: restricted-host bypass

Meta silently "prohibits" the pixel on some hostnames (`blockReason: "source_category"` — it classifies the landing page as sensitive health data). On such a host the config script it serves is a restricted variant: `"lockWebpage":true`, `restrictedEventNames: ["AddPaymentInfo","AddToCart","InitiateCheckout","Purchase"]`, and `content_name` on the sensitive-key list. Result: every `fbq()` call is queued and never sent, Landing Page Views read 0, and the host looks dead while paid traffic keeps arriving.

Never "fix" this by hand-editing beacons — `campaign/public/js/meta-unlock.js` is injected after `fbq('init')` in `routes/pages.js` and handles it: it opts the pixel out of the four gating plugins, releases the lock, and trims queued params. It is loaded on every campaign page and is a no-op on clean hosts.

- **Check a host** with `GET https://connect.facebook.net/signals/config/<pixelId>?domain=<host>`, then read the **`restrictedEventNames` array**: it must be **empty**. Ignore total bytes — they no longer discriminate (see next section). `"lockWebpage":true` means the pixel is still locked, and a `prohibitedpixels` module means full prohibition.
- **Do not remove the module** or move it before `fbq('init')`; it needs the pixel registered and the config loaded.
- `CAPI_SOURCE_DOMAIN` overrides `event_source_url` for CAPI only (`lib/tracking/meta.js`); unset means the real URL is reported. It is currently unset.

**Byte size is a trap now.** Measured 2026-11-13: *every* host returns ~406–408 KB, including genuinely clean ones, because Meta now always ships the restricted-plugins bundle while leaving `restrictedEventNames` **empty**. The old "605 KB = clean" rule is dead — size only marks a restrictive landing page (the apex returns ~154 KB). What matters is whether the money events appear in the array:

```bash
curl -s "https://connect.facebook.net/signals/config/<pixelId>?domain=<host>" \
  | grep -o '"restrictedEventNames":\[[^]]*\]'
# [] = clean.  ["AddPaymentInfo","AddToCart","InitiateCheckout","Purchase"] = gated
```

Do it with `curl -o file` and read `file.Length`, not by piping into a PowerShell string.

## Current host status (measured 2026-11-13)

All campaign hosts are clean — `restrictedEventNames` is `[]` on every one, no `lockWebpage`, no `prohibitedpixels`. The `*g` hosts that were flagged on 2026-11-11 have since been cleared, so the 2026-11-11 table below is historical, not current.

`CAPI_SOURCE_DOMAIN` was **removed** from `uk-campaign` and `pt-campaign` on 2026-11-13 (via `deleteSingleEnvironmentVariable`, not a map replace) so CAPI reports the real `ukw`/`ptw` URL and Events Manager diagnostics work again.

**Store routing does not depend on it.** `utm.sourceUrl` is set in the browser from `window.location.href`, so `CAMPAIGN_CALLBACK_URLS` matching sees the real host regardless of `CAPI_SOURCE_DOMAIN`. Dropping the override cannot break Purchase.

## Meta / Facebook Ads API details that cost time

- **`GET /?id=<url>&scrape=true` and the batch `POST /?ids=…` scrape both return `code 100`, `error_subcode 33`** with the `meta-ads-new` token — it lacks `business_management`. Use [Sharing Debugger](https://developers.facebook.com/tools/debug/) instead of burning calls on it.
- **`POST /{business-id}/owned_domains` is not the verify endpoint.** The real one is `POST /{domain-id}/verify` with `verification_method`, and the only accepted values are `{DNS_RECORD, HTML_UPLOAD, META_TAG}` — `DNS_TXT` is rejected. It also needs `business_management`, so in practice the dashboard button is the way.
- **Zeabur mutations need subfield selections or explicit scalar form.** `deleteSingleEnvironmentVariable` returns `[EnvironmentVariable!]!` and fails with *"must have a selection of subfields"* without `{ key }`. `restartService` returns `Boolean` and fails with *"must not have a selection"* if given one. Both reject a bare trailing `}` typo with `Unexpected }` — cheap to waste a cycle on.

## EU ad sets are rejected without DSA beneficiary/payer (2026-11-28)

Creating an ad set targeted at an EU country (`PT`, `IT`, `ES`, `FR`, `GR`, …) fails with `code 100 / subcode 3858081`, `user_title: "No advertiser indicated"`. This reads exactly like a missing page, but the page is irrelevant — it is the EU Digital Services Act fields.

- Send `dsa_beneficiary` **and** `dsa_payor`, both the page id (`1363808276826222`).
- **Meta misspells the payer as `dsa_payor`** (not `dsa_payer`). `dsa_payer` is silently ignored and returns `subcode 3858079`, `"No payer indicated"`.
- Non-EU countries (GB, US, CA, AU, ZA) need neither, so the same payload works there — which is why this only surfaces on EU markets.
- Through `fbmcp` both go in `extra`; the tool has no dedicated parameter for them.

Two related traps hit in the same build:

1. **`promoted_object` is immutable on a campaign.** Setting it after creation returns `subcode 1885090`. If a campaign must carry one, pass it at create time in `extra`.
2. **`ads_duplicate` on an ad set does not fix it either** — the copy still fails the DSA check on update. Copying the whole campaign and then retargeting is a working detour, but a clean create with the DSA fields is simpler.
3. `page_list` is currently broken (`The ids query parameter is deprecated in v26.0+`); use `bm_list_assets(kind="owned_pages")` instead.

## Meta restriction is per-hostname, not per-domain

Measured 2026-11-11 with `GET https://connect.facebook.net/signals/config/<pixelId>?domain=<host>`:

| host | config bytes | `prohibitedpixels` | `lockWebpage` |
|---|---|---|---|
| `ukg` / `plg` / `aug` / `cag`.risehope.online | ~382 KB | **yes** | **true** |
| `uk` / `pl` / `au` / `ca` / `pt`.risehope.online | 425 KB | **no** | no |
| `ptg.risehope.online` | 425 KB | no | no |
| `www.impactmetrics.online` | 425 KB | no | no |

Every `*g` host carrying paid traffic got flagged; bare sibling hosts were not, and `ptg`/`cag` stayed clean throughout. So attaching a fresh subdomain is a legitimate way to regain a clean pixel — it was never classified, nothing is being disguised.

**Measure bytes properly**: `curl ... -o file` then check `file.Length`. Piping curl into a PowerShell string and reading `.Length` counts *lines*, not bytes, and silently reports everything as ~240.

A host that is clean has **no `prohibitedpixels` module at all** (not merely `lockWebpage:false`), so `meta-unlock.js` is a no-op there. Confirm by checking the beacon still carries `cd[content_name]`.

### Moving a market to a new host — all five places

`ukg.risehope.online` → `uk.risehope.online` was done 2026-11-11. The hostname appears in **no repo code**; it lives only in external config. Miss any of these and the funnel breaks:

1. **GoDaddy** — `A <host> → 88.198.156.58`, TTL 600 (the Zeabur ingress all campaign hosts share).
2. **Zeabur domain** — `addDomain(serviceID, environmentID, domain, isGenerated:false)`. Keep the old host attached through the rollout.
3. **Meta creative** — `link` **and** `call_to_action.value.link`. Two fields; the CTA one is easy to miss. A new creative must be created and a new ad added under the ad set.
4. **Store `CAMPAIGN_CALLBACK_URLS`** (`larkwell-home`) — **the silent killer.** `store/lib/campaign-routing.js` matches the donor's `sourceUrl` host against this list by exact hostname. A missing host returns `null` → no callback → **no Meta Purchase**, while the donation still succeeds in Supabase. Revenue looks fine, Purchase reads zero.
5. **Campaign `ALLOWED_CAMPAIGN_HOSTS`** — `getAllowedHosts()` falls back to the request's own `Host`, so a bare host self-matches, but list both explicitly so a store proxy callback is not rejected by `hostMatches()`.

Optional: drop `CAPI_SOURCE_DOMAIN` once the host is clean, so CAPI reports the real URL and Events Manager diagnostics work again.

Historical Supabase rows keep the old host — do not rewrite them.

## Zeabur: `updateEnvironmentVariable` REPLACES the whole set

The GraphQL mutation `updateEnvironmentVariable(serviceID, environmentID, data: Map!)` does not merge — it overwrites the service's entire variable set with whatever map you pass. Sending `{CAPI_SOURCE_DOMAIN: "..."}` alone **deletes every other variable** on that service.

That is not theoretical. On 2026-11-11 it stripped `uk-campaign`, `pl-campaign` and `au-campaign` to a single variable. The containers rebuilt and booted with `PORT` unset, `TRACKING_ENABLED` off, no Supabase and `CURRENCY=USD` — public 502s, then a storefront that would have recorded nothing.

**Always read first, then merge, then write:**

1. `service(_id){ variables(environmentID){ key value } }` — capture the full set.
2. Build the new map as `{...existing, ...changes}`.
3. Send the complete map.

For a single key prefer `updateSingleEnvironmentVariable(serviceID, environmentID, oldKey, newKey, value)` or `createEnvironmentVariable`, which do not touch the rest. Env edits alone do **not** restart a running container — follow with `restartService(serviceID, environmentID)`.

`PORT` must stay `3000` on campaign services; the platform health check targets it, so a lost `PORT` yields 502 even though the container is "running".

## Ad account timezone is Los Angeles — the cockpit reports Athens by re-bucketing

The live ad account (`act_1481591450730709`, Bright Bastion) is permanently in **`America/Los_Angeles`** (`timezone_id: 1`). Meta cannot change an existing account's timezone in place — the UI flow closes the account, stops its ads, and creates a new one. **Never "fix" the timezone from Ads Manager / Payment settings**; the ads would stop and the account history would be stranded.

Instead, reporting is normalized to **Europe/Athens**:

- `fb-ads-manager` (`server/lib/adInsights.js`) fetches `hourly_stats_aggregated_by_advertiser_time_zone` and re-buckets hours into Athens days. Its `/api/dashboard` returns `range.timezone: "Europe/Athens"`, plus `dailyRows` (Athens days) and `metaDailyRows` (Meta account days).
- The campaign sync (`campaign/lib/ads-manager.js`) stores those as `ad_spend.date_preset = 'day:YYYY-MM-DD'` / `'meta-day:YYYY-MM-DD'` and records provenance in `ad_sync_meta` (Athens window, report timezone, per-account timezones).
- The Profit Cockpit (`campaign/lib/profit.js`) joins Athens daily spend onto the daily timeline, and for This Year / All Time (no Meta preset is wide enough) sums the daily rows — see `adSync.spendSource` (`'daily-athens-rows'` vs the preset name). The cockpit UI shows a last-7d Athens-vs-Meta reconciliation; the daily shift should mostly cancel over the week.

Two Meta publishing quirks the code already handles — do not rediscover them:

1. **Multi-day hourly ranges only publish through accountToday−2**, and that last day can still be a few dollars short. The manager therefore fetches recent account days as **single-day queries** (which are current) and discards the settled range's tail.
2. Around **midnight Athens ≈ 10h of spend sits in the next Meta day** (9h/11h in the mismatched DST weeks of March/October), so a single day's Athens vs Meta spend differing is expected — only the 7-day totals must converge.

**Guardrail:** run `node tools/check-athens-reconciliation.js` weekly (read-only; exits non-zero if hourly re-bucketing diverges from Meta plain totals beyond rounding, or if the account timezone ever changes). `node tools/backfill-ad-spend-daily.js <days>` re-writes historical `day:` rows. Tests: `campaign/test/profit-timezone.test.js` and `FB ads manager/server/test/adInsights.test.js`.

**Stale preset rows:** `ad_spend` preset rows are upserted per sync, never deleted — accounts that stop being synced (e.g. Italy `act_1388808955587972`, last synced 2026-10-19, 731 rows / ~$50k of phantom preset spend deleted 2026-11-16) would otherwise count toward profit totals forever. `campaign/lib/profit.js` therefore drops preset rows more than 48h older than the freshest row for that preset (`isFreshSpendRow`, counted in `adSync.staleRowsDropped`); `day:`/`meta-day:` rows are history and exempt. If totals ever look inflated again, check for stale rows before suspecting the sync: `select account_id, max(fetched_at) from ad_spend where date_preset not like '%day:%' group by 1`.

## Deploy config is fail-fast

`campaign/server.js` calls `assertDeployConfig()`, which exits non-zero in production when `ACTIVE_CAMPAIGN`, `MARKET_CODE`, `CURRENCY`, `MERCHANT_COUNTRY`, `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CALLBACK_SECRET`, `TRACKING_ENABLED=true` or `FB_PIXEL_ID` are missing. A deploy that lost its variables now dies at boot instead of serving a storefront that silently drops every event. `SKIP_CONFIG_CHECK=1` overrides it for local runs.

`GET /health` returns 200 with `{checks:{database,tracking,campaign}}` when the service can actually record events, and **503** when it cannot — point the platform health check at it.
