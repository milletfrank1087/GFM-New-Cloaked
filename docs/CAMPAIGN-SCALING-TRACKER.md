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

| Campaign | Ad Set Name | Ad Set ID | Initial Budget | Aug 23 Adjustment | Optimization Goal |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GBM Grace - UK** | `($100/day) UK - Broad - Volume` | `120247843570680464` | $100.00/day | **$125.00/day** | Offsite Conversions |
| **GBM Grace - UK** | `($50/day) UK - Broad - Value - Fixed` | `120247791368750464` | $50.00/day | **$65.00/day** | Value |
| **GBM Grace - UK** | `($50/day) UK - Broad - Volume - Fixed` | `120247466901930464` | $50.00/day | **$65.00/day** | Offsite Conversions |
| **GBM Emily - USA** | `($75/day) US - Broad - Volume - New Creative` | `120247166773850464` | $75.00/day | **$95.00/day** | Offsite Conversions |
| **GBM Emily - USA** | `($75/day) US - Broad - Value` *(New)* | *(Duplicated from above)* | — | **$75.00/day** | Value |
| **TOTALS** | | | **$275.00/day** | **$425.00/day** | *(+54.5% Scaling Step)* |

---

## 📝 Change Log & Decision History

### 2026-08-23 (Sunday) — Scale Kickoff (Dual-Vector Scaling: +54.5%)
* **Context:** Past 7 days achieved 2.99x true ROAS with fresh audiences (frequency 1.17–1.25) and strong CTRs (>5.6%). US campaign demonstrated high ticket sizes ($31.67 avg, 61.2% revenue from gifts $\ge$ $50), while UK generated consistent volume ($7.64 CPA).
* **Actions Taken:**
  1. Increased UK Volume ad set from $100 $\rightarrow$ $125/day (+25%).
  2. Increased UK Value Fixed ad set from $50 $\rightarrow$ $65/day (+30%).
  3. Increased UK Volume Fixed ad set from $50 $\rightarrow$ $65/day (+30%).
  4. Increased US Broad Volume ad set from $75 $\rightarrow$ $95/day (+26%).
  5. Created and launched new ad set: `($75/day) US - Broad - Value` optimized for conversion value.
* **Total Daily Budget:** Increased from **$275/day $\rightarrow$ $425/day**.
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
