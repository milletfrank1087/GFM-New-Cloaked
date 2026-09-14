# Campaign Scaling & Performance Tracker

This document tracks all campaign changes, budget adjustments, daily performance metrics, and unit economics across Meta Ads and Stripe ledgers for the UK and US fundraising campaigns.

---

## ⚡ Optimal Prompt for Future Re-evaluations

Copy and paste the exact prompt below into future Cursor sessions to trigger an automated performance review and strategic recommendation:

```text
Read docs/CAMPAIGN-SCALING-TRACKER.md. Query the latest Meta Ads insights (via FB ads manager proxy/sqlite) and live Stripe transactions (via Supabase) for the last 7 days and today. Analyze the impact of our recent budget changes, evaluate unit economics (true CPA, ROAS, average ticket size, CPC, frequency), update the log in docs/CAMPAIGN-SCALING-TRACKER.md, and propose the exact next step-by-step actions for today.
```

---

## 🎯 Target KPI & Unit Economics Benchmarks

| Metric | UK Campaign (`GBM Grace`) | US Campaign (`GBM Emily`) | Blended Target |
| :--- | :--- | :--- | :--- |
| **Target ROAS (Stripe Net)** | $\ge$ 2.80x | $\ge$ 2.80x | $\ge$ 2.85x |
| **Max Acceptable CPA** | $\le$ $9.50 (£7.30) | $\le$ $13.50 | $\le$ $10.50 |
| **Target CPC (Unique)** | $\le$ $0.85 | $\le$ $1.65 | $\le$ $1.10 |
| **Target CTR (Unique Link)** | $\ge$ 5.0% | $\ge$ 4.5% | $\ge$ 5.0% |
| **Target Avg Donation** | $\ge$ £16.00 ($20.80) | $\ge$ $30.00 | $\ge$ $24.00 |
| **Max Frequency (7-day)** | $\le$ 1.80 | $\le$ 1.80 | $\le$ 1.80 |

---

## 📊 Historical Performance Log & Baselines

### Latest Review (Sep 7 – Sep 14, 2026)

* **Meta Ad Spend:** $2,520.48 ($1,375.10 UK / $979.03 US / $166.35 FCR)
* **Stripe Confirmed Revenue:** **$3,926.40 USD** (UK $2,529 / US $1,288 / FCR $110)
* **Confirmed Donors:** **157 donors** (UK 107 / US 43 / FCR 3 + 8 partial today)
* **True Blended ROAS:** **1.56x** | **True Blended CPA:** **$16.05**
* **Average Donation:** **$25.01** (UK $23.89 / US $28.35 / FCR $36.67)
* **Audience Health:** UK Volume CTR 6.48%, Freq 1.20, CPC $0.93 | US CTR 5.60%, Freq 1.19, CPC $1.78 | FCR OFFSITE CTR 15.78%, CPC $1.19

### Week 1 Baseline (Aug 17 – Aug 23, 2026)

* **Meta Ad Spend:** $1,759.25 ($1,237.16 UK / $522.09 US)
* **Meta Reported Revenue:** $4,547.67 ($3,140.21 UK / $1,407.46 US) | Reported ROAS: **2.58x**
* **Stripe Confirmed Revenue:** **~$5,267.40 USD** (£2,858.00 UK / $1,552.00 US) | True Net ROAS: **2.99x**
* **Confirmed Donors:** **211 donors** (162 UK / 49 US)
* **True CPA:** **$8.34** ($7.64 UK / $10.65 US)
* **Average Donation:** **$24.96** (£17.64 UK / $31.67 US)
* **Audience Health:** UK CTR 6.45%, Freq 1.25, CPC $0.79 | US CTR 5.66%, Freq 1.17, CPC $1.54

---

## 🛠️ Active Ad Set Registry & Budget History

| Campaign | Ad Set Name | Ad Set ID | Aug 24 Level | Aug 30 Cut | Sep 2 Status | Sep 14 Status | Optimization Goal |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GBM Emily - USA** | `($145/day) US - Broad - Volume - New Creative` | `120247166773850464` | $145.00/day | $145.00/day | **ACTIVE ($145/d)** | **ACTIVE ($145/d)** | Offsite Conversions |
| **GBM Emily - USA** | `($100/day) US - Broad - Value` | `120247961202480464` | $100.00/day | — | **PAUSED** | **PAUSED** | Value |
| **GBM Grace - UK** | `($95/day) UK - Broad - Value - Fixed` | `120247791368750464` | $95.00/day | $95.00/day | **ACTIVE ($95/d)** | **ACTIVE ($95/d)** | Value |
| **GBM Grace - UK** | `($65/day) UK - Broad - Volume - Fixed` | `120247466901930464` | $80.00/day | $65.00/day | **PAUSED (Sep 2)** | **PAUSED** | Offsite Conversions |
| **GBM Grace - UK** | `($105/day) UK - Broad - Volume` | `120247843570680464` | $130.00/day | $105.00/day | **ACTIVE ($105/d)** | **ACTIVE ($105/d)** | Offsite Conversions |
| **FCR Clover - USA** | `($50/day) US - Broad - Volume [OFFSITE]` | `120248193185110464` | — | — | — | **ACTIVE ($50/d)** | Offsite Conversions |
| **FCR Clover - USA** | `($50/day) US - Broad - Volume - Comments` | *(original)* | — | — | — | **ACTIVE ($50/d)** | Value |
| **TOTALS (active)** | | | **$550.00/day** | **$410.00/day** | **$345.00/day** | **$445.00/day** | *(+$100/d FCR)* |

---

## 📝 Change Log & Decision History

### 2026-09-14 (Monday) — 12-Day Review, FCR Petition Launch Assessment & Efficiency Alert

* **Scope & Method:** Meta Marketing API (last_7d + last_30d, campaign + ad-set level) via fb-ads-manager proxy + Supabase Stripe ledger (weekly aggregates Aug 24 – Sep 14).
* **Last 7 Days (Sep 7–14):**
  * **Meta Ad Spend:** $2,520.48 ($1,375.10 UK / $979.03 US / $166.35 FCR)
  * **Stripe Gross Revenue:** $3,926.40 (UK $2,529 / US $1,288 / FCR $110)
  * **True Blended ROAS:** **1.56x** (down from 2.05x on Sep 2, 2.99x Week 1)
  * **True Blended CPA:** **$16.05** (was $16.31 Sep 2 — held steady but not improving)
  * **Confirmed Donors:** 157 (UK 107 / US 43 / FCR 3 + 8 today partial)
* **30-Day Meta Totals (for context):**
  * GBM Grace UK: $6,740 spend, 584 Meta purchases, 2.32x Meta ROAS, $11.54 Meta CPA
  * GBM Emily US: $4,195 spend, 230 Meta purchases, 1.63x Meta ROAS, $18.24 Meta CPA
  * FCR Clover US: $166 spend, 0 Meta purchases (attribution lag on petition funnel)
* **Per-Ad-Set 7-Day Drill-down:**
  * `UK Volume ($105/d)`: $714.51 spend, 82 purchases, **2.42x Meta ROAS**, $8.71 CPA. **Only set above all thresholds.** CTR 6.48%, CPC $0.93.
  * `UK Value Fixed ($95/d)`: $660.59 spend, 38 purchases, **2.54x Meta ROAS**, $17.38 CPA. ROAS looks good but CPA **fails the $12 UK threshold** and volume is half of UK Volume at similar spend.
  * `US Volume ($145/d)`: $979.03 spend, 46 purchases, **1.15x Meta ROAS**, $21.28 CPA. **Fails 72h rule** (ROAS < 2.00x for 2+ weeks). CPM $91.81.
  * `FCR OFFSITE ($50/d)`: $103.25 spend, 0 Meta purchases, 87 clicks, **15.78% CTR**, $1.19 CPC, 160 LPV, 5 InitiateCheckout. Strong engagement but petition→donation funnel is long.
  * `FCR Comments/Value ($50/d)`: $63.10 spend, 0 Meta purchases, 31 clicks, 36 LPV, 1 IC. **$178 CPM**. VALUE optimization mismatched with uniform $25/$50 petition amounts — can't exit learning phase.
* **Week-over-Week Stripe Revenue Decline:**
  * Aug 24–30: $5,316 gross (220 donors, $24.16 avg)
  * Aug 31–Sep 6: $5,017 gross (175 donors, $28.67 avg)
  * Sep 7–13: $3,677 gross (145 donors, $25.36 avg) ← **−27% WoW**
* **Tips & Subscriptions:** Total tips in 14d window: $766.30. Tip averages: UK $1.96/donor, US $2.74/donor, FCR $3.33/donor. No subscriptions detected.
* **Recommended Actions (not yet executed):**
  1. US Emily: Cut to $95/day or pause — 1.15x ROAS at $145/day is net-negative (~$60/day burn).
  2. UK Value Fixed: Cut to $65/day — $17.38 CPA vs $12 threshold. Redirect $30/day to UK Volume.
  3. FCR Comments (VALUE): Pause — VALUE optimization with uniform petition amounts can't optimize. OFFSITE ad set is delivering 4x the LPVs at lower CPC.
  4. FCR OFFSITE: Hold at $50/day for another 7 days to accumulate Purchase events.
  5. No scaling — blended 1.56x ROAS is far below the 2.20x hold band. Priority is cutting losses.

---

### 2026-09-02 (Wednesday) — 72h Post-Cut Re-evaluation & UK Overlap Pruning
* **Scope & Method:** Meta Marketing API (Aug 30 – Sep 2 daily & aggregated) + live Supabase Stripe ledger (`www.larkwellhome.online`).
* **Cumulative 4-Day Ledger (Aug 30 – Sep 2):**
  * **Meta Ad Spend:** $1,582.34 ($979.73 UK / $602.61 US)
  * **Stripe Gross Revenue:** **$3,241.40 USD** (£1,878 UK / $800 US)
  * **Net Profit Margin:** **+$1,659.06** (51.2% gross margin)
  * **Completed Donations:** **97 donors** (72 UK / 25 US)
  * **True Blended ROAS:** **2.05x** | **True Blended CPA:** **$16.31**
* **Campaign & Ad Set Deep Dive:**
  * **UK Grace Campaign:** Total spend $979.73, confirmed £1,878 ($2,441.40 USD) → **2.49x True ROAS**, **$13.61 True CPA** (£10.47).
    * `UK Value Fixed` ($95/day): Meta ROAS **4.05x** ($347.67 spend → $1,409.29 value, 26 purchases @ $13.37 Meta CPA). Highest-margin asset.
    * `UK Broad Volume` ($105/day): Meta ROAS **2.00x** ($387.47 spend → $775.40 value, 28 purchases @ $13.84 Meta CPA).
    * `UK Broad Volume Fixed` ($65/day): Meta ROAS **1.41x** ($244.59 spend → $346.04 value, 15 purchases @ $16.31 Meta CPA). Flatlined on Sep 1 ($48 spend for 0 conversions). Fails the 72h $\ge$ 2.00x benchmark.
  * **US Emily Campaign:** Total spend $602.61 ($532.41 on active Volume + $70.20 on paused Value), confirmed $800.00 USD → **1.33x True ROAS**, **$24.10 True CPA** ($19.01 Meta CPA on active Volume).
    * `US Volume New Creative` ($145/day): Improved progressively (Sep 1: 2.38x ROAS / $18.02 CPA; Sep 2: 2.10x ROAS / $15.44 CPA). CPM remains elevated at **$84.08**.
* **Action Executed (Sep 2 Evening):**
  * **Paused** `($65/day) UK - Broad - Volume - Fixed` (`120247466901930464`) to eliminate internal auction self-competition. Verified live status: `PAUSED`.
  * **Active daily budget reduced to $345.00/day** ($200/day UK + $145/day US).
* **Next Review:** Sep 3 (Thursday evening) 24h calibration check.

---

### 2026-09-01 (Tuesday) — Why CPA is not $3 anymore (Ads Manager + Larkwell-only Stripe)
* **Scope:** Meta May–Aug monthly + Aug daily. Supabase only `www.larkwellhome.online` (first payment 31 Jul). Optimisystems/Luci not mixed.
* **The $3 memory:** July **GBM Grace UK** Meta CPA **$3.36** / ROAS **5.94x** on **$1,334** spend (~$43/day). June Grace $4.88. US Emily was never $3 (Jul $12.80, May $8.96 on $403 spend). Mariana PT May $5.07, paused 1 Jun.
* **Not creative:** every live ad is still `Image 1`. “New Creative” is an ad-set label (US Volume cloned 18 Jul). Quality ranking bottom 20%; conversion rate above average.
* **Not the Stripe switch:** Larkwell live 31 Jul; UK Meta CPA **1–7 Aug $4.63** and **8–16 Aug $5.61** while already on Larkwell. CPA broke when spend scaled (17 Aug / 24 Aug), not when the store changed.
* **What did it:** UK Aug spend **$4,728** (3.5× July) + three competing UK ad sets + US CPM ~$70 + the 24 Aug +57% step / US Value ($47 CPA).
* **No further ad edits today.** Hold $410 mix through 2 Sep evening.

---

### 2026-08-30 (Sunday) — Post-scale cut (−25.5% to $410/day)
* **6-day evaluation after the Aug 24 +57% scale:**
  * Blended Stripe true ROAS **2.03x** (was 2.99x pre-scale). True CPA **$15.01** (was $9.19). Spend +69%, Stripe revenue only +15%. Frequency still 1.20–1.38 — not saturation.
  * **US Value** (`120247961202480464`): $564.65 spend, 11 purchases, Meta ROAS **0.86x**, CPA **$51.33**. Never approached 50 weekly events. Ticket $44 vs $33 on Volume — not whales.
  * **US Volume:** Meta ROAS 2.13x, CPA $15.47 — hold band. Left at $145/day.
  * **UK Value Fixed:** Meta ROAS **2.94x**, CPA $10.60 — only set still at target. Left at $95/day.
  * **UK Volume $130 / Volume Fixed $80:** Meta ROAS 1.65x / 1.68x, CPA above $12. Both cleared the 72h reduce line.
* **Actions executed (live Graph verify):**
  1. **Paused** `($100/day) US - Broad - Value` (`120247961202480464`) — status PAUSED.
  2. **Cut** UK Broad Volume $130 → **$105/day** (`120247843570680464`), renamed to `($105/day) UK - Broad - Volume`.
  3. **Cut** UK Volume Fixed $80 → **$65/day** (`120247466901930464`), renamed to `($65/day) UK - Broad - Volume - Fixed`.
  4. **Held** US Volume $145 and UK Value $95. No targeting / creative / bid edits.
* **Total active daily budget:** **$550/day → $410/day** (−$140/day).
* **Do not touch until:** Tue 2 Sep evening. Scoreboard is Stripe, not Ads Manager. Do not add age/gender ad sets. Age_min=45 is Phase 2 only if 1–2 Sep true ROAS stays under 2.20x.
* **Next Review:** 2026-09-02 (Tuesday evening).

---

### 2026-08-24 (Monday) — 24h Re-evaluation & Hard Scale (+57.1% to $550/day)
* **24h Evaluation Post-Aug 23 Budget Raise:**
  * **US Campaign:** Outperformed across all metrics. Spend $86.60, Meta ROAS **5.17x**, Stripe Net ROAS **4.94x** ($428.00 confirmed revenue from 9 donors). Average donation jumped to **$47.56** (with large gifts of $250, $50). CTR surged to **6.30%** and CPC dropped to **$1.15**.
  * **UK Campaign:** Total spend $279.98, generated £490.00 (~$637 USD) in Stripe revenue across 20 donors (2.28x true ROAS). The `Value` ad set delivered **3.74x Meta ROAS** ($6.44 CPA, £175 raised), proving value-optimization is the highest-margin bidding model.
* **Scaling Strategy Executed:**
  1. **Aggressive US Surge:** Increased US Volume ad set from $95 $\rightarrow$ **$145/day** (+52.6%).
  2. **US Value Branch:** Launched `($100/day) US - Broad - Value` to isolate whale donors at scale.
  3. **UK Value Scaling:** Scaled `UK Value Fixed` from $65 $\rightarrow$ **$95/day** (+46.1%) following 3.74x ROAS.
  4. **UK Volume Adjustments:** `UK Volume Fixed` $65 $\rightarrow$ **$80/day**, `UK Broad Volume` $125 $\rightarrow$ **$130/day**.
* **Total Daily Budget:** Increased from **$350/day $\rightarrow$ $550/day** (+$200/day, +57.1%).
* **Store Routing:** `Larkwell Home` processed $9,031.60 across 439 transactions with zero gateway warnings. Monthly cap: $10M.
* **Next Review:** Aug 25 (Tuesday evening) calibration check.

---

### 2026-08-23 (Sunday) — Scale Kickoff (Dual-Vector Scaling: +54.5%)
* **Context:** Past 7 days achieved 2.99x true ROAS with fresh audiences (frequency 1.17–1.25) and strong CTRs (>5.6%). US campaign demonstrated high ticket sizes ($31.67 avg, 61.2% revenue from gifts $\ge$ $50), while UK generated consistent volume ($7.64 CPA).
* **Actions Taken:**
  1. Increased UK Volume ad set from $100 $\rightarrow$ $125/day (+25%).
  2. Increased UK Value Fixed ad set from $50 $\rightarrow$ $65/day (+30%).
  3. Increased UK Volume Fixed ad set from $50 $\rightarrow$ $65/day (+30%).
  4. Increased US Broad Volume ad set from $75 $\rightarrow$ $95/day (+26%).
* **Total Daily Budget:** Increased from **$275/day $\rightarrow$ $350/day**.
* **Store Routing:** `Larkwell Home` (`www.larkwellhome.online`) active at 100% weight.
* **Next Review:** Check evening pacing on Aug 23 / Morning review on Aug 24.

---

## 🚦 Scaling Decision Matrix & Rules of Thumb

1. **When to Increase Budget (+20% step-up):**
   * Ad set has run for $\ge$ 48 hours.
   * True ROAS $\ge$ 2.80x and CPA $\le$ target ($9.50 UK / $13.50 US).
   * Frequency is $\le$ 1.60.
2. **When to Hold / Observe:**
   * ROAS between 2.20x and 2.79x.
   * Day 1 or Day 2 following a budget adjustment (allow Meta auction pacing to settle).
3. **When to Reduce Budget or Pause:**
   * ROAS $<$ 2.00x over a trailing 72-hour window.
   * CPA exceeds $16.00 in US or $12.00 in UK with $\ge$ $150 spend.
   * Frequency exceeds 2.20 with CTR dropping below 3.5%.
