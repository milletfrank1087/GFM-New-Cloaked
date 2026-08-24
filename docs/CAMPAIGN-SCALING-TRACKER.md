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

| Campaign | Ad Set Name | Ad Set ID | Aug 23 Level | Aug 24 Scale Target | Optimization Goal |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GBM Emily - USA** | `($95/day) US - Broad - Volume - New Creative` | `120247166773850464` | $95.00/day | **$145.00/day** | Offsite Conversions |
| **GBM Emily - USA** | `($100/day) US - Broad - Value` *(New)* | *(Branch from above)* | — | **$100.00/day** | Value |
| **GBM Grace - UK** | `($65/day) UK - Broad - Value - Fixed` | `120247791368750464` | $65.00/day | **$95.00/day** | Value |
| **GBM Grace - UK** | `($65/day) UK - Broad - Volume - Fixed` | `120247466901930464` | $65.00/day | **$80.00/day** | Offsite Conversions |
| **GBM Grace - UK** | `($125/day) UK - Broad - Volume` | `120247843570680464` | $125.00/day | **$130.00/day** | Offsite Conversions |
| **TOTALS** | | | **$350.00/day** | **$550.00/day** | *(+57.1% Scale Step)* |

---

## 📝 Change Log & Decision History

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
