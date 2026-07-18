# Campaign Refresh Playbook

Periodic maintenance to keep campaign pages believable as time passes. All time-sensitive content lives in the campaign JSON files under `campaign/campaigns/`. The frontend reads these JSON files via `/api/campaign` and renders them client-side.

## When to Refresh

Refresh every **2–3 weeks**. The two main staleness signals a visitor notices:

1. **"daysLeft" reads 33–35** — if a campaign has said "33 days left" for two months, it's obviously fake.
2. **Updates section** — the newest update says "14 May 2026" but the visitor is reading it in August.

## What Goes Stale (Checklist)

| # | Field | Where | What to change | Cadence |
|---|-------|-------|----------------|---------|
| 1 | `daysLeft` | Every campaign JSON | Reset to 28–38 (vary across files; never all identical) | Every 2–3 weeks |
| 2 | `updates[]` | Every campaign JSON | Push dates forward; add 1 new update, drop the oldest | Every 2–3 weeks |
| 3 | `raised` | Every campaign JSON | Bump by 15–25% of current value (round to nearest 10) | Every 2–3 weeks |
| 4 | `donorCount` | Every campaign JSON | Bump by 15–25% (round to integer) | Every 2–3 weeks |
| 5 | `organizer.createdDate` | Every campaign JSON | Move forward by ~2 weeks (keeps it "recent enough") | Every 4–6 weeks |
| 6 | `recentDonors[].time` | Every campaign JSON | Ensure top 3 are "X min ago" not "hours ago" | Every refresh |
| 7 | `milestones[].reached` | Every campaign JSON | First milestone should always be `true`; flip second to `true` when `raised` passes it | When `raised` crosses a threshold |
| 8 | Story body dates | Every campaign JSON (inside `story.sections[].content`) | "December 2025" → "February 2026" etc. — shift the medical timeline forward | Every 4–6 weeks |

### What is NOT stale (skip these)

- **`raised` + `donorCount` on the live page** — the `/api/campaign` endpoint adds real Supabase stats (`realRaised`, `realDonorCount`) on top of the JSON base values. The JSON values are the "seed" / floor.
- **Images** — the gallery photos don't go stale.
- **Cost breakdown** — treatment costs don't need updating.
- **Story sections** (the medical narrative) — only the specific date references within them need shifting, not the prose itself.

## How to Refresh

### Option A: Use the refresh script (fastest)

An existing script `campaign/scripts/refresh-dates-2026-05.js` handles most of the work:

1. **Copy the script**, rename to reflect today's date:
   ```
   cp campaign/scripts/refresh-dates-2026-05.js campaign/scripts/refresh-dates-YYYY-MM.js
   ```

2. **Edit the new script's constants:**
   - `TODAY_ISO` — set to today's date
   - `BODY_REPLACEMENTS` — update the `[oldStr, newStr]` pairs to shift dates forward by ~2 months from their current values. Every language has its own pairs (en, it, pt, fr, el, pl, es). The GBM campaigns and leukemia campaigns have different date sets.
   - `CHROME_REPLACEMENTS` — update `createdDate` and all `updateDates` per language. These are the organizer creation date and the 4 update section dates.
   - In the main function body, adjust `json.daysLeft` to the new target (vary 28–38).
   - Adjust the `raised` multiplier (currently `1.20` = +20%).
   - Adjust the `donorCount` multiplier (currently `1.20` = +20%).

3. **Dry run first:**
   ```bash
   node campaign/scripts/refresh-dates-YYYY-MM.js --dry-run
   ```

4. **Apply:**
   ```bash
   node campaign/scripts/refresh-dates-YYYY-MM.js
   ```

5. **Verify:** Spot-check 2–3 JSON files (one EN, one non-EN) to confirm dates, raised, donorCount, daysLeft all look right.

6. **Commit and deploy** the campaign server.

### Option B: Manual edit (for targeted fixes)

Edit the specific JSON files directly. This is appropriate when only 1–2 fields need updating (e.g., just bumping `daysLeft` or adding a new update entry).

## Update Content Guidelines

### Writing a new `updates[]` entry

Each campaign has 4 updates. When refreshing:

1. Change the dates on all 4 existing updates (shift forward by ~2 weeks).
2. Optionally add a new entry at position `[0]` with `"isNew": true` and set all others to `"isNew": false`.
3. If adding a 5th, remove the oldest (position `[3]`) to keep it at 4.

**GBM update themes** (rotate through these):
- MRI follow-up results (stable / no new lesions)
- Donor milestone crossed (500, 750, 1000, 1500 donors)
- Treatment response update (patient feeling stronger)
- Germany clinic scheduling update (awaiting funding confirmation)
- Emotional update from patient (quote about hope/gratitude)

**Leukemia update themes:**
- Molecular testing results (BCR-ABL levels)
- Chemotherapy cycle completion
- Donor milestone crossed
- Transplant scheduling progress
- Emotional update from patient/family

### Medical timeline rules

The medical narrative follows a fixed structure. When shifting dates forward:

- Keep the same relative spacing (diagnosis → surgery → chemo → MRI follow-up is ~3 months).
- The "current state" should always be: standard treatment completed, waiting for the experimental treatment (immunotherapy for GBM, transplant for leukemia), needing funding.
- Never write updates that say treatment has started in Germany — the campaign must always be fundraising toward that goal.

### Raised / DonorCount progression rules

- `raised` should be **30–45% of the goal** — high enough to show momentum, low enough to show urgency. If it's approaching 50%, slow the multiplier (1.05–1.10 instead of 1.20).
- `donorCount` should grow proportionally. A campaign with £34k raised and 612 donors has an average of ~£56/donor. Keep this ratio plausible (£15–£60 average).
- Grace (UK) campaigns have lower goals (£75k–£90k) and should have lower raised amounts.
- Emily (USA) campaigns have higher goals ($150k) and can have higher raised amounts.
- Non-EN campaigns (Sofia/el, Serafina/it, Chloe/fr, Mariana/pt, Natalia/pl, Lucia/es) should have similar but NOT identical raised/donor values to each other.

### daysLeft rules

- Vary between 25–40 across files. Never set all files to the same number.
- A visitor who sees "3 days left" will feel urgency but also suspicion if the page still exists a week later. Keep it at 25+ to avoid this.
- The countdown is static (from the JSON) — there's no live timer. It just shows whatever the JSON says.

## Per-Language File Reference

| Language | GBM file | Leukemia file |
|----------|----------|---------------|
| EN (UK) | `glioblastoma-grace.json` | `leukemia-grace.json` |
| EN (US) | `glioblastoma-emily.json` | `leukemia-emily.json` |
| IT | `glioblastoma-serafina.json` | `leucemia-serafina.json` |
| PT | `glioblastoma-mariana.json` | `leucemia-mariana.json` |
| FR | `glioblastome-chloe.json` | `leucemie-chloe.json` |
| EL | `glioblastoma-sofia.json` | `leukemia-sofia.json` |
| PL | `glejak-natalia.json` | `bialaczka-natalia.json` |
| ES | `glioblastoma-lucia.json` | `leucemia-lucia.json` |

That's **16 files total** (8 GBM + 8 leukemia).

## Post-Refresh Verification

1. Run sterility check: `cd campaign && npm run sterility-check`
2. Start locally: `npm start`
3. Visit the campaign page and verify:
   - Progress bar / raised / donor count look right
   - "Days left" shows the new value
   - Updates section shows the new dates and the newest update has the "NEW" badge
   - No console errors
4. Commit, push, redeploy the campaign Railway service.

## Current State Snapshot (refreshed 18 Jul 2026 via `refresh-dates-2026-07.js`)

| Field | Current value | Next refresh needed |
|-------|---------------|---------------------|
| `daysLeft` | 27–38 (varied per file) | Early August 2026 |
| Last update date | 10–12 Jul 2026 | Early August 2026 |
| `organizer.createdDate` | 1 Jun 2026 | Early August 2026 |
| Story body dates | "February 2026" diagnosis, "March 2026" surgery, "May 2026" MRI | Early August 2026 (shift to Apr/May/Jul) |
| `raised` / `donorCount` | Unchanged (not bumped this cycle) | Bump +15–20% next refresh |
| Actual Supabase totals | 2,453 donations / $63,782 total revenue (added on top of JSON seed) | Informational only |

### Refresh history

| Date | Script | What changed |
|------|--------|-------------|
| ~May 2026 | `refresh-dates-2026-05.js` | Shifted story dates from Oct/Nov 2025 → Dec 2025/Jan 2026. Update dates to May. Bumped raised ×1.20 and donorCount ×1.20. |
| 18 Jul 2026 | `refresh-dates-2026-07.js` | Shifted story dates from Dec 2025/Jan 2026 → Feb/Mar 2026. Update dates to Jun–Jul. Created Jun 1. daysLeft varied 27–38. No raised/donor bump. |
