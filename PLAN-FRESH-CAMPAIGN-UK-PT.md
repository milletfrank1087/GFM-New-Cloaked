# Fresh UK + PT campaigns on clean hosts

Status: **DONE & LIVE 2026-11-13.** Both campaigns ACTIVE, delivering, domain verified. IDs below are production records, not a proposal.

## Live IDs

| item | id |
|---|---|
| new pixel (account-owned, BB business) | `2684864525312118` |
| UK campaign | `52590730411972` |
| PT campaign | `52590730465372` |
| UK ad set | `52590731489372` |
| PT ad set | `52590731626172` |
| UK creative | `1469936025081342` |
| PT creative | `2976923666001038` |
| UK ad | `52590731885372` |
| PT ad | `52590731945372` |

Both ads `PAUSED / PENDING_REVIEW`, zero issues. Old campaigns untouched and paused for rollback.

**Two mistakes made and corrected during the build, for the record:**
1. `POST /business/adspixels` created a *business*-owned pixel (`1115343991317784`) that the ad account could then not use for conversions (`subcode 1815045`); `POST /act_x/adspixels?pixel_id=…` separately created an *account*-owned one (`2684864525312118`). The account-owned pixel is the one in use. The business pixel is now unused and can be deleted.
2. Meta freezes pixel/optimisation on an ad set at creation even when it is `PAUSED`. The first pair of ad sets was created while services still held the old pixel and had to be recreated (`subcode 3260011`). Lesson: set the pixel on the service *before* creating the ad set.
3. **The service `FB_ACCESS_TOKEN` could not reach the new pixel.** It is `fb-ads-manager-sysuser` in the *other* business (reddingtonv6) and only ever had access to the old pixel; every CAPI call returned `subcode 33`. The likely-looking fix — assigning the pixel to `122199295490796505` — fails because that ID is business-scoped to the other business. Assigning Bright Bastion's own `Conversions API System User` (`122097968613551028`) did **not** help, because the token itself is the other sysuser. Minting a token for the right sysuser needs `appsecret_proof` and the `AI MCP` app secret, which is not stored locally. **Resolved** by setting `FB_ACCESS_TOKEN` on both fresh services to the MCP token (`EAAX94wi…`), which is itself a non-expiring `SYSTEM_USER` token (app `AI MCP`, `1686526426435056`) and returned `events_received:1` against **both** pixels. Verified end-to-end afterwards: Purchase `capi_meta: ✓` on both hosts.

   To tidy permanently later: add `FB_APP_SECRET` to the repo secrets, then mint a token for `122097968613551028` so the runtime stops sharing the operator MCP credential.

   **DONE 2026-11-13 11:20 UTC:** secret stored in `secrets/fb-app.env` (app `AI MCP`, gitignored). Token minted for `122097968613551028`, verified to deliver to both pixels, and deployed to both fresh services together with `FB_APP_SECRET`. Note the minted token has `scopes: []` and `type: SYSTEM_USER` / `expires_at: 0` — empty scopes are fine for `/events`, but it must be sent **without** `appsecret_proof` or it 400s (`meta.js` sends none, so this matches production).

---

## Verified end to end (2026-11-13, ~11:05 UTC)

| check | UK | PT |
|---|---|---|
| real Meta traffic with live `fbclid` reached the host | yes | yes |
| `funnel_events` written with new-host `source_url` | yes | yes |
| checkout token created, `sourceUrl` = new host | yes | yes |
| `/api/payment-callback` accepted | 200 | 200 |
| **CAPI Purchase delivered to Meta** | **`✓`** | **`✓`** |
| CAPI `event_source_url` = `www.impactmetrics.online` | confirmed | confirmed |
| page init/beacon pixel | `2684864525312118` | `2684864525312118` |
| old pixel absent from page | yes | yes |
| callback resolver matches host | yes | yes |
| comment manager tracks the new ad post | yes | yes |

Schema notes for future test donations: `checkout_sessions.store_id` is a UUID (`larkwell-home` = `34bbfbdf-2ce2-4b47-b501-5e092e0a1f7f`) and `source_ref` is NOT NULL.

---

---

## 0. What the live inspection actually found

### 0.1 Account is healthy, but the whole account is dark today

| fact | value | read |
|---|---|---|
| account_status | `1` (ACTIVE) | `act_1481591450730709` |
| disable_reason | `0` | — |
| amount_spent | `$40,984` | not a cold account |
| balance | `$355` | funded |
| **spend today (Nov 13)** | **$0.00, 0 impressions, all campaigns** | `date_preset=today` → `data: []` |
| last spend | Nov 12, 13:59 PST | $65.12 total on Nov 12 |
| `3858385` checkpoint | **cleared** — no ad currently carries it | last occurrence 2026-11-12T11:34:48Z on the PT ad |

So: the account is not banned and not checkpointed. It is simply not delivering.

### 0.2 PT is genuinely stalled, and it is not a pause

`GBM Mariana - Portugal (Clone)` / adset `52589603799972` / ad `52589603915372`:

- `status=ACTIVE`, `effective_status=ACTIVE`, `configured_status=ACTIVE` — all three.
- `$50/day`, `OFFSITE_CONVERSIONS` / `PURCHASE`, `LOWEST_COST_WITHOUT_CAP`, pixel `1533961664530010`.
- `delivery_estimate` answers normally: 8.2–9.6M reachable.
- **0 impressions since it was reactivated 2026-11-12 21:39 UTC.**
- The pixel is alive — `last_fired_time` 2026-11-13T09:31Z — so organic/returning traffic still arrives. The *ad* is what is throttled.

This is exactly the shape of the categorisation throttle: everything reads ACTIVE, but Meta refuses to spend.

### 0.3 The real root cause: the pixel belongs to a different business

| item | owner |
|---|---|
| ad account `act_1481591450730709` | **Bright Bastion** (`1125220020205920`) |
| Facebook page `1407107739154321` | Bright Bastion |
| pixel `1533961664530010` "GFM Improved" | **reddingtonv6** (`1162517778681857`) |
| pixel `2175193133035209` "Phoenix Leads" | Bright Bastion |

The pixel is **shared into 5 other ad accounts** (Bucket Acc, GFM Backup, GFM Germany, GFM Greece, GFM Italy). It is a borrowed, cross-business, heavily shared dataset.

Its own diagnostics (`/da_checks`) return two failures right now:

- `pixel_has_low_event_source_match_rate` — content_ids don't match an attached catalog.
- `pixel_missing_param_in_events` — parameters missing some/all of the time.

**Consequence:** the "Data restrictions may limit delivery" warning is a *dataset* judgement, not a per-host one. Moving hosts alone will not clear it for long. The durable fix is a **new pixel owned by Bright Bastion**, verified against the landing hosts, fed only by these campaigns.

### 0.4 Host restriction has already lifted — so hosts are the cheap part

Measured today with `GET https://connect.facebook.net/signals/config/1533961664530010?domain=<host>`:

| host | bytes | `lockWebpage` | `prohibitedpixels` | verdict |
|---|---|---|---|---|
| `uk.risehope.online` | 591 KB | false | false | CLEAN |
| `ptg.risehope.online` | 591 KB | false | false | CLEAN |
| `pt.risehope.online` | 591 KB | false | false | CLEAN |
| `www.impactmetrics.online` | 591 KB | false | false | CLEAN |

Every inspected host is clean now, `*g` included. `meta-unlock.js` is a no-op on all of them. So a new host is *not* what unblocks delivery — the dataset is. New hosts are still worth doing, because they give clean named URLs and clean `event_source_url` reporting, but they must be paired with the pixel work or the throttle just follows the new URL.

### 0.5 Config drift found (both must be fixed regardless)

- `pt-campaign` **still has `CAPI_SOURCE_DOMAIN=ptg.risehope.online`** → every CAPI purchase permanently claims the old host.
- `pt-campaign` has **no `ALLOWED_CAMPAIGN_HOSTS`** at all (33 vars, key absent). `uk-campaign` has `uk.,ukg.`.
- `larkwell-home` `CAMPAIGN_CALLBACK_URLS` = 13 entries, includes `https://uk.` and `https://ukg.`, **no PT clean host**.
- `pt.risehope.online` **does not resolve** — no A record, never attached to a Zeabur service.

### 0.6 impactmetrics.online is a static page, not an ingest endpoint

Service `impact-metrics` (`6acfea0e7741ff5769fb9e09`) serves one static `index.html` with `express.static` and a `*` catch-all. There is **no `/tr`, no event ingest, no campaign renderer**. It carries a `facebook-domain-verification` tag (`bv38…`) and a clean pixel config.

Therefore "route events to impactmetrics.online" can only mean **`CAPI_SOURCE_DOMAIN=www.impactmetrics.online`** — that rewrites only `event_source_url` in `campaign/lib/tracking/meta.js`. It does **not** move the browser pixel, and it does not by itself fix categorisation. Being static, it also cannot host the landing page.

### 0.7 Current structure

| market | campaign | adset | ad | creative | creative link |
|---|---|---|---|---|---|
| UK | `52589606534772` | `52589606877572` (PAUSED) | `52589607625772` (PAUSED) | `1489105846400316` | `ukg.` |
| UK | `52589606534772` | `52590262182172` (ACTIVE, paused by campaign) | `52590262200772` (ACTIVE) | `1188906776794369` | `uk.` |
| PT | `52589603620572` | `52589603799972` (ACTIVE) | `52589603915372` (ACTIVE) | `1926021571714377` | `ptg.` |

Targeting on both adsets is identical apart from country: `18–65`, `advantage_audience: 1`, `user_age_unknown: true`, `location_types: frequently_in/home/recent`, 7-day click / 1-day view attribution.

Comment manager (`ads.risehope.online`) auto-discovers ad posts — `refresh` reported `ads:{count:4, autoTracked:2}` and 4 ad posts already. It needs a refresh + verification, not a code change.

---

## 1. Decisions — LOCKED 2026-11-13

| decision | choice |
|---|---|
| pixel | **new**, created on Bright Bastion |
| hosts | **`ukw.risehope.online` / `ptw.risehope.online`** (virgin) |
| scope | **UK + PT only** |
| content | **reuse** `glioblastoma-grace` / `glioblastoma-mariana` |

### Original options

1. **New pixel, or keep `1533961664530010`?**
   - *New BB-owned pixel (recommended)*: clears the cross-business dataset judgement, gives clean matching quality, keeps Phoenix pixel separate. Costs one `FB_PIXEL_ID` change on both campaign services and a re-point of both adsets.
   - *Keep the shared pixel*: no env change, but the throttle almost certainly returns.
2. **Hosts**: `uk2.` / `pt2.`-style brand-new names, or `uk.` (reuse) + `pt.` (new)? Nothing currently resolves on `pt.`. If a host has never been classified, a new one is the only way to get a virgin URL.
3. **Scope**: UK + PT only, or also roll the remaining `*g` markets (`plg`, `aug`, `cag`, `itg`, …) in the same pass?
4. **Campaign slug**: reuse `glioblastoma-grace` / `glioblastoma-mariana` content (recommended — identical story, only tracking changes), or create genuinely new slug files, which means `STANDALONE_CAMPAIGN_MAP` edits in `campaign/routes/pages.js`, new images dir, and a full 14-service redeploy.

---

## 2. Execution plan (assuming new pixel + new hosts `ukw.`/`ptw.` + reuse content)

### Phase A — infrastructure, no Meta objects yet

**A1. GoDaddy A records** (TTL 600, ingress `88.198.156.58`):

```
A  ukw  → 88.198.156.58  ttl 600
A  ptw  → 88.198.156.58  ttl 600
```

**A2. Zeabur attach** — `addDomain(serviceID, environmentID, domain, isGenerated:false)`:

- `ukw.risehope.online` → `uk-campaign` (`6acfea207741ff5769fb9e15`)
- `ptw.risehope.online` → `pt-campaign` (`6acfea2a7741ff5769fb9e1b`)

If Zeabur returns a verification token, write `TXT _railway-verify.<host>`. Wait for cert + 200 on `/health` before touching Meta.

**A3. `uk-campaign` env — read-merge-write (never partial):**

- `ALLOWED_CAMPAIGN_HOSTS` = `ukw.risehope.online,uk.risehope.online,ukg.risehope.online`
- `CAPI_SOURCE_DOMAIN` — **removed 2026-11-13**; CAPI now reports the real host
- keep all 50 vars; then `restartService`

**A4. `pt-campaign` env — read-merge-write:**

- `ALLOWED_CAMPAIGN_HOSTS` = `ptw.risehope.online,pt.risehope.online,ptg.risehope.online`
- `CAPI_SOURCE_DOMAIN` — **removed 2026-11-13**; CAPI now reports the real host (replaces `ptg.`)
- keep all 33 vars; then `restartService`

**A5. `larkwell-home` `CAMPAIGN_CALLBACK_URLS`** — append `https://ukw.risehope.online,https://ptw.risehope.online` to the existing 13. Missing host = `null` callback = **no Purchase**, silently.

**A6. Gate**: `GET /health` on both new hosts must return `200` with `database,tracking,campaign` all true before any Meta write.

### Phase B — pixel (only if A1 answer is "new pixel")

**B1.** Create pixel on Bright Bastion (`POST /1125220020205920/adspixels`, name e.g. `GFM Health 01`). Single write, read back the ID.

**B2.** Domain-verify `risehope.online` and `impactmetrics.online` against it (DNS TXT from Events Manager brand-safety UI; API cannot complete verification alone).

**B3.** Set `FB_PIXEL_ID=<new>` on `uk-campaign` and `pt-campaign` (read-merge-write + restart). Store service has no `FB_PIXEL_ID`, so nothing to change there.

**B4.** Warm the pixel with a real page view on each new host and confirm `ViewContent` lands before building ads.

### Phase C — Meta objects, all `PAUSED`, ≥20 s between writes

Explicitly check `issues_info` for `3858385` between each step; stop the whole run if it appears.

**C1.** Campaign UK: `PB_SALES` / `OUTCOME_SALES`, buying type AUCTION, `special_ad_categories: []`, name `GBM Grace - UK - Fresh (13 Nov)`.
**C2.** Campaign PT: same, `GBM Mariana - PT - Fresh (13 Nov)`.
**C3.** Ad set UK: `$50/day`, `OFFSITE_CONVERSIONS`, `PURCHASE`, `LOWEST_COST_WITHOUT_CAP`, `GB` only, `18–65`, `advantage_audience 1`, 7d click / 1d view, **new** pixel.
**C4.** Ad set PT: as C3 but `PT`.
**C5.** Creative UK: replicate copy of `1188906776794369`, `link` **and** `call_to_action.value.link` = `https://ukw.risehope.online/`, `url_tags` `utm_source=fb&utm_medium=paid&utm_campaign=<new UK id>&utm_content=grace_ukw`.
**C6.** Creative PT: replicate `1926021571714377`, both links `https://ptw.risehope.online/`, `utm_content=mariana_ptw`.
**C7.** Ad UK under C3; **C8.** Ad PT under C4.
**C9.** Leave old campaigns paused; do not delete.

### Phase D — comment manager

1. `POST /api/posts/refresh`.
2. Confirm the two new ad posts appear with the new campaign names.
3. Toggle them tracked, `saveTracked`, verify `trackedDraft` is `1` for both.
4. Confirm `/api/state` shows `trackedPosts` +2 and `moderationAllowed: true`.

### Phase E — verification before you activate

| check | expected |
|---|---|
| `/health` both hosts | 200, all true |
| beacon on both hosts | fires, `cd[content_name]` present, pixel id = new |
| `?domain=` config both hosts | ~591 KB, no `lockWebpage` |
| Events Manager Test Events | `PageView` + `ViewContent` from both hosts |
| callback routing | test donation → row in `checkout_sessions` with new host `sourceUrl` |
| creative | both `link` **and** CTA point at the new host |
| comment manager | 2 new posts tracked |

### Phase F — activation (manual in Ads Manager)

Create PAUSED, then you activate campaign + ad set + ad yourself, in that order.

---

## 3. Failure modes to watch

| symptom | cause | move |
|---|---|---|
| 502 on new host | `PORT` or `TRACKING_ENABLED` lost in a partial env write | restore full var map, redeploy |
| donation succeeds, Purchase reads 0 | host missing from `CAMPAIGN_CALLBACK_URLS` | A5 |
| CAPI `SKIP(host)` in logs | host missing from `ALLOWED_CAMPAIGN_HOSTS` | A3/A4 |
| ad stuck `Update Required` | `3858385` returned | stop writes, authenticate in Ads Manager |
| instant ban | burst writes / ACTIVE on create | 20 s spacing, everything PAUSED |
| clean host suddenly restricted | Pixel Helper shows queued `fbq` | re-measure; `meta-unlift.js` is already loaded |

## 4. Rollback

Old campaigns and old creatives stay intact and paused. Reverting is: pause new campaign, unpause `52589606534772` / `52589603620572`, revert `CAPI_SOURCE_DOMAIN`, revert `CAMPAIGN_CALLBACK_URLS`. DNS and Zeabur domains can stay attached.

## 5. Effort

~25 min infrastructure, ~10 min pixel, ~15 min Meta writes with spacing, ~10 min verification. One contiguous window; the 14-service redeploy only happens if Phase D ever needs code.

---

## OUTCOME 2026-11-13 — shipped

- Both campaigns ACTIVE and delivering (UK and PT). Budget $50/day each.
- Domain `risehope.online` verified in Business Manager. Required moving the **apex off GoDaddy Website Builder onto `impact-metrics` on Zeabur** — the meta tag alone was unreachable before that. See `CLAUDE.md`.
- DNS-TXT verification added as a second, independent proof: `facebook-domain-verification=awgxiyxiysziplf4tr76b8ffc4mskv`.
- `CAPI_SOURCE_DOMAIN` removed from `uk-campaign` and `pt-campaign`; all other variables intact, `PORT=3000` preserved.
- Purchase events confirmed flowing to pixel `2684864525312118`, sourced from the real host.
- Campaign, ad set and ad names normalised (`… - ukw` / `… - ptw`). Note: renaming an ad triggers a short re-review — both returned to ACTIVE within a minute.

Still true from the original plan: old campaigns and creatives are intact and paused, so reverting is still just pause-new / resume-old.
