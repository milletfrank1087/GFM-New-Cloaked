# UK campaign — build record (2026-11-26)

Ad account `act_3936327343175633` (Business `1578611613719194`, USD, Europe/Athens), pixel `1130405372925347`
("GFM Pixel"), Page `1363808276826222` (Rise Hope, unverified). All created **PAUSED** via `fbmcp`; nothing spends yet.

| Object | ID | Status |
|---|---|---|
| Campaign — GBM Grace - UK - Warmup (26 Nov), OUTCOME_SALES, `special_ad_categories: []` | `120250365594160290` | PAUSED |
| Ad set — GBM Grace - UK - Broad 18-65, 5000 minor/day, OFFSITE_CONVERSIONS/PURCHASE, GB 18–65, 7d click / 1d view | `120250365607370290` | PAUSED |
| Creative — Gemini 1:1, hash `350be449c0ca6e0f4dcfe4c820cde6d4`, CTA `LEARN_MORE`, description filled | `1709228277257409` | ACTIVE (normal) |
| Ad — GBM Grace UK - Gemini 1x1 - ad v3 (current) | `120250369581490290` | PAUSED |
| Creative + ad v2 — old 1.jpg, same copy | `1496998655655317` / `120250365741390290` | PAUSED |

URL in `link` **and** `call_to_action.value.link`: `https://ukw.risehope.online/`, `utm_content=grace_uk_clean`
(plus `url_tags` with the same parameters).

## Which pixel, and why it matters

Decision 2026-11-26: **donations use `1130405372925347`; the Stateside farm uses `1162651836735062`.**

The Meta UI "Ad creative" panel from the old account offers `1533961664530010` ("GFM Improved") and, on the Phoenix
ad set, `2175193133035209` ("Phoenix Leads", flagged **"not active — no events for 7 days"**). Neither is fired by any
page. The panel is stale. Do not blindly take its pixel.

| pixel | fired by `ukw` / `statesidepartners` | events | in portfolio? |
|---|---|---|---|
| `1130405372925347` GFM Pixel | **yes / yes** | hourly PageView + ViewContent + CAPI | yes |
| `1533961664530010` GFM Improved | no / no | none | **no** |
| `2175193133035209` Phoenix Leads | no / no | **none** | **no** |
| `1162651836735062` Farm Pixel | no / **yes** (since 2026-11-26) | yes | yes |

All four return `restrictedEventNames: []` on these hosts, so byte size and gating do not discriminate — only which
page actually fires them does. The old pixel returns 619 KB vs 410 KB, which looks "cleaner" and misleads.

`lead.risehope.online` is gone (Zeabur service deleted, DNS removed). The Phoenix/Stateside funnel lives at
`statesidepartners.online/apply`; `www` is a CNAME to `@`. Its service is `lead-form` in project `fynex-lead-form`
(service `6b080907fa4b3d6a6202233f`, production env `6acfe8b299b42396d4a013f6`), recreated after the old one was
deleted — `secrets/zeabur-services.json` still lists the dead `6acfea9538646b1d1c92794` id.

On 2026-11-26 `FB_PIXEL_ID` there was switched from `1130405372925347` to the Farm Pixel with
`updateSingleEnvironmentVariable` (all 7 vars preserved), then `restartService`. Verified: `/apply` now emits
`1162651836735062`, and a test lead returned `201` with `events_received: 1`. Test rows:
`probe.farm.20261126@example.com`, `probe.e2e.20261126@example.com` — delete when convenient.

## End-to-end state (verified 2026-11-26)

Working: `/api/init-donation` → 200 + real store URL (GBP 25.00); `/checkout` with the `__session` cookie → 200,
36,928 bytes, correct `£25`, fires `1130405372925347`; `CALLBACK_SECRET` identical on campaign and store (same
SHA-256 prefix); `/api/leads` → 201 with Meta `events_received: 1`; `/health` green on database, tracking and campaign.

Not verified: a real card payment, so the **Purchase** leg and the Stripe webhook remain unproven end to end.

## Old account performance (act_1481591450730709, 27 Oct – 25 Nov)

| Ad set | Spend | Purchases | CPA | ROAS |
|---|---|---|---|---|
| PT `ptw` | $167.03 | 15 | $11.14 | 1.63 |
| UK `ukw` | $168.88 | 10 | $16.89 | 1.45 |
| UK "Clean Host" | $62.53 | 2 | $31.27 | 0.93 |

UK landing-page views cost `£2.44` on the best UK ad set. Every UK ad set ended `not_delivering` / `inactive`.
The "fresh clean host" strategy performed worst, not best. A cold `$0` account must beat ~`$31` CPA to clear a
£25–30 average gift.

## Gotchas hit

- **`DONATE` CTA is rejected** — `subcode 2446855`, *"The type of ad must be a donation ad in order to have a DONATE
  CTA."* A plain `object_story_spec` link ad is not one. `LEARN_MORE` is used instead. The rejected `DONATE` creative is
  `1851886379470144`.
- **`fbmcp` gates creative links on `allowed_domains`** (`~/.fbmcp/portfolios.toml`). Only the four Stateside domains
  were listed. Added the campaign hosts (4 → 22); backup `portfolios.toml.bak-before-risehope`. The server caches policy
  at boot and needed a restart. **Cursor's MCP client may need a window reload** — otherwise use
  `operator/fbmcp-call.js`, which drives the same server over stdio.
- `media_upload_image` reads only `~/.fbmcp/media`, not the repo.
- `ads_get` / `ads_list` take `object_id` / `campaign_id`; neither returns `promoted_object`, so the ad set's pixel
  cannot be read back — only trusted from creation.
- Graph does not allow querying `_id`/`name` on `ProjectConnection`; projects and environments need `edges`/nested
  lookups, and `environments` is not a field on `Service`.

## Still open

- Ad is in review; `promoted_object` unverifiable by read.
- `FB_AD_ACCOUNT_ID` is unset on 12 of 13 campaign services.
- Page `not_verified`; business is `verified`.
- 12 env keys duplicated on `uk-campaign` (39 distinct of 51).
- Copy now says December throughout the page; activation is manual after review.
