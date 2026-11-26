# UK campaign — build record (2026-11-26)

Ad account `act_3936327343175633` (Business `1578611613187194`, USD, Europe/Athens), pixel `1130405372925347`
("GFM Pixel"), Page `1363808276826222` (Rise Hope, unverified). All created **PAUSED** via `fbmcp`; nothing spends yet.

| Object | ID | Status |
|---|---|---|
| Campaign — GBM Grace - UK - Warmup (26 Nov), OUTCOME_SALES, `special_ad_categories: []` | `120250365594160290` | PAUSED |
| Ad set — GBM Grace - UK - Broad 18-65, 5000 minor/day, OFFSITE_CONVERSIONS/PURCHASE, GB 18–65, 7d click / 1d view | `120250365607370290` | PAUSED |
| Creative — 1:1, hash `38ba2229948b729d0732c929bc3d122f`, CTA `LEARN_MORE` | `1496998655655317` | ACTIVE (normal) |
| Ad — GBM Grace UK - 1x1 - ad v2 | `120250365741390290` | PAUSED, PENDING_REVIEW |

URL in `link` **and** `call_to_action.value.link`: `https://ukw.risehope.online/` (+ utm_source/medium/content/campaign).

## Gotchas hit

- **A `DONATE` CTA is rejected** with `subcode 2446855` — *"The type of ad must be a donation ad in order to have a DONATE CTA."* A plain `object_story_spec` link ad is not one. Use `LEARN_MORE` unless the ad is built as a donation ad. Creative `1851886379470144` is the rejected `DONATE` version; keep it only if you later switch ad type.
- **`fbmcp` gates creative links on `allowed_domains`** in `~/.fbmcp/portfolios.toml`. It listed only the four Stateside domains, so `risehope.online` was refused. Domains were added (22 now) and the server **caches the policy at boot** — a restart was required. Backup: `portfolios.toml.bak-before-risehope`.
- **The MCP client does not reconnect mid-turn.** `operator/fbmcp-call.js` drives the same server over stdio JSON-RPC in a fresh process; use it when the tool calls return `Not connected`.
- `media_upload_image` only reads `~/.fbmcp/media`, not the repo.
- `ads_get` takes `object_id`, not `ids`/`level`.

## Still open

- Ad is in review; unit economics assume a ~£25–30 average gift against £50/day.
- `FB_AD_ACCOUNT_ID` is unset on 12 of 13 campaign services; `uk-campaign` is the only one holding it.
- Page is `not_verified`; nothing blocks delivery, but identity verification helps review and trust.
- 12 env keys are duplicated on `uk-campaign` (39 distinct of 51 rows).
- Activation is manual in Ads Manager after review clears.
