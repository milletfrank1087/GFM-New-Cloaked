# Launch checklist: Canada, Australia, Poland

Owner legend: **[C]** = Claude can do it · **[U]** = needs you (dashboard / posting / decision).
Same routine as the Spain relaunch (2026-09-28). Never call live Stripe (see CLAUDE.md).

## 0. Decisions & prerequisites (before spending)

- [ ] **[U] Payment capacity:** activate a second shop in the rotation (Supabase `stores.weight_pct`) before the three markets + Italy/Portugal/Spain scaling push Larkwell past ~200 donations/day.
- [ ] **[U] Stripe dashboard check (Larkwell):** account country, fees for international cards (CA/AU), CAD/AUD/PLN accepted, Radar not blocking non-EU cards. Claude must not query live Stripe.
- [ ] **[U] Rotate the GoDaddy API key:** it was pasted into a chat; create a new key/secret in the GoDaddy developer portal and update `secrets/godaddy.env`.
- [ ] **[U] Poland service:** reuse "GFM Glioblasoma Poland" (GFM New project) or create a fresh "PL Campaign" in GFM Cloaked like the other live markets (recommended: fresh, same repo/deploy flow).
- [ ] **[U] Canada language scope:** English-only (target by English language or exclude Québec). Recommended for launch.

## 1. Story & creative (per market)

| | 🇨🇦 Canada | 🇦🇺 Australia | 🇵🇱 Poland |
|---|---|---|---|
| Patient | new name, 21, med student, Toronto (U of T) | new name, 21, med student, Melbourne (Monash/UniMelb) | Natalia, 21, med student (existing page) |
| Public system line | surgery/radiation covered by **OHIP**; German immunotherapy not covered by any public plan | covered by **Medicare / public hospital**; immunotherapy not covered | covered by **NFZ**; immunotherapy not covered |
| Language / currency | English · CAD | English · AUD | Polish · PLN |

- [x] **[C]** Write ad copy per market (proven "In an instant, everything changed" template, diagnosis month + hospital + university).
- [x] ~~**[U]** Create the 3 posts manually~~: app "Comments" switched to Live, posts created via API (2026-09-28).
- [x] **[C]** Post IDs: 🇨🇦 `113297813778299_1101303592455693` · 🇦🇺 `113297813778299_1101303639122355` · 🇵🇱 `113297813778299_1101303722455680`

## 2. Landing pages (campaign JSON)

- [ ] **[C]** `glioblastoma-<name>-ca.json` + `-au.json`: story aligned to the ad (diagnosis month, surgery date, hospital, university), created 16 Aug 2026, updates 20/10 Sep, 29 days left, raised/donors, "2 min ago" labels, images.
- [ ] **[C]** `glejak-natalia.json`: align to the Polish ad, same dates pattern, Polish time labels.
- [ ] **[C]** Price presets: CAD/AUD `[10,20,25,50,100,250]` default 25; PLN `[40,80,100,200,400,1000]` default 100 (≈ €25).
- [ ] **[C]** Check English (`en`) campaign locale reads naturally for CA/AU spelling; Polish (`pl`) complete incl. checkout + monthly offer.
- [ ] **[C]** Local test per market (Stripe **test** keys): page, currency formatting, checkout locale, monthly offer amounts in CAD/AUD/PLN, logs show `CA`/`AU`/`PL`. Clean test rows.

## 3. Infrastructure

- [ ] **[C]** Railway: create "CA Campaign", "AU Campaign" (+ "PL Campaign" if chosen) in GFM Cloaked, same repo/root as IT Campaign. Variables copied from IT Campaign, then: `ACTIVE_CAMPAIGN`, `CURRENCY=CAD|AUD|PLN`, `DEFAULT_LANGUAGE=en|en|pl`, `MERCHANT_COUNTRY=CA|AU|PL`, `MARKET_CODE=CA|AU|PL`, `ADS_SYNC_ENABLED` off.
- [ ] **[C]** Railway custom domains: `cag.risehope.online`, `aug.risehope.online`, `plg.risehope.online` (or existing `polg`) → get CNAME target + verify token.
- [x] **[C]** GoDaddy DNS (cag re-attached 2026-09-28, CNAME → l4ppwax7.up.railway.app; all 3 serve HTTPS 200): add `CNAME <sub> → <x>.up.railway.app` and `TXT _railway-verify.<sub>` for each; wait for Railway certificate.
- [ ] **[C]** Larkwell `CAMPAIGN_CALLBACK_URLS`: add the new origins (Larkwell redeploys).
- [x] **[C]** Meta pixel: confirm no `prohibitedPixels` on each new subdomain (risehope.online + subdomains is already allow-listed).
- [ ] **[C]** Profit cockpit: CAD/AUD/PLN exchange rates available (ECB/Frankfurter ✓); new `source_ref`s show per campaign.
- [ ] **[C]** Live smoke test (no payment): page loads, pixel fires, donate → Larkwell checkout shows CAD/AUD/PLN + right language.

## 4. Ads (GFM Italy account, created PAUSED)

- [ ] **[C]** One campaign per market (Sales), one ad set: lowest cost, Purchase, 7-day click / 1-day view, broad, Advantage+ audience, 18–65.
  - 🇨🇦 $75/day (English-only / excl. Québec) · 🇦🇺 $75/day · 🇵🇱 $50/day
- [x] **[C]** Ads (ACTIVE inside PAUSED campaigns, in review): 🇨🇦 `23859766890900790` · 🇦🇺 `23859766891630790` · 🇵🇱 `23859766892080790`
- [ ] **[U]** Approve go-live → **[C]** activate once ads pass review and the landing page is live.

## 5. First 72 hours

- [ ] **[C]** Day 1: spend pacing, real donations (Supabase), checkout monitor (exit steps, browser errors, declines by market, esp. international cards).
- [ ] **[C]** Day 3: keep/kill per market on **real net ROAS ≥ 2×**; then +25–30%/day scaling like Italy.
