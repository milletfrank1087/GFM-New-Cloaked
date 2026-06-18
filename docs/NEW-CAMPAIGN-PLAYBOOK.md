# NEW-CAMPAIGN-PLAYBOOK.md

End-to-end runbook for spinning up a new-language campaign. Designed so that a single prompt like "Create a Bulgarian campaign end to end" results in a fully-deployed instance with this doc as the only reference an agent needs.

## How to use

Read this top to bottom once. Then execute sections 1 → 11 in order. Section 12 is the FB ad copy the user pastes. Section 13 is what the user must do manually (DNS + FB launch).

## 1. Inputs the agent must collect (or infer)

| Var | Example | How to pick |
|---|---|---|
| `<LANG>` | `bg` | ISO 639-1 code |
| `<LANG_FULL>` | `Bulgarian` | English name |
| `<COUNTRY>` | `BG` | ISO 3166-1 alpha-2 |
| `<CURRENCY>` | `EUR` | Eurozone = EUR; otherwise local (PLN, BGN, RON…) |
| `<DOMAIN>` | `bgg.risehope.online` | `<2-letter>g.risehope.online` pattern |
| `<PATIENT>` | `Maria` | Country-native first name (female, 21yo med student) |
| `<PATIENT_INITIAL>` | `M.` | First letter + dot |
| `<ORGANIZER>` | `Elena Petrova` | Country-native full name |
| `<ORG_INITIALS>` | `EP` | First letter of each name |
| `<CITY>` | `Sofia` | Patient's city |
| `<UNIVERSITY>` | `Medical University of Sofia` | Real local med school |
| `<HOSPITAL>` | `Pirogov` | Real local hospital + (for leukemia) hematology institute |
| `<PATIENT_SISTER>` | `Anna` | Sister for HSCT donor (leukemia variant) |
| `<CAMPAIGN_SLUG_GBM>` | `glioblastoma-maria` | Localized disease prefix + patient name |
| `<CAMPAIGN_SLUG_LEU>` | `leucemia-maria` | Localized disease prefix + patient name |

If the user didn't supply these, propose a set and confirm in one bundled question before proceeding.

## 2. Pre-flight checks

```powershell
node campaign/scripts/sterility-check.js
git status
```

Working tree should be clean. Sterility check must PASS.

## 3. Campaign JSON files

Two JSONs, structurally identical to existing ones. **Don't write from scratch — clone the IT pair and translate.**

```powershell
Copy-Item campaign/campaigns/glioblastoma/glioblastoma-serafina.json campaign/campaigns/glioblastoma/<CAMPAIGN_SLUG_GBM>.json
Copy-Item campaign/campaigns/leukemia/leucemia-serafina.json campaign/campaigns/leukemia/<CAMPAIGN_SLUG_LEU>.json
```

Then in each file, translate to `<LANG>`. Hand-edit substitutions:

- `id` → new slug
- `title` / `description` → translate, keep `<PATIENT>` name
- `organizer.name/initials/location/createdDate` → `<ORGANIZER>`, `<ORG_INITIALS>`, `<CITY>, <COUNTRY_LOCALIZED>`, current date format used by other campaigns of same language (or `10 Apr 2026`-equivalent)
- `images[].url/thumb` → swap path prefix to new slug; copy/upload images into `campaign/public/images/campaigns/<slug>/` (4 files: `1.jpg` … `4.jpg`)
- `story.intro` / `story.sections[].content` → full translation. Replace city names, hospitals, universities with localized real ones. Keep the **medical content identical** (Glioblastoma IDH-wildtype grade IV, MGMT non-methylated, Stupp protocol, dendritic cell vaccines in Germany — that's the canonical narrative; do not invent variations).
- `story.quote.author` → `<PATIENT> <PATIENT_INITIAL>`
- `updates[].date/title/content` → translate; dates use the **same shift as the current refresh** (latest = 12-15 May 2026 range; launch = 10 Apr 2026; check `campaign/scripts/refresh-dates-2026-05.js` for the per-language month abbreviations)
- `milestones[].label` → translate
- `topDonors[].name` / `recentDonors[].name/message/time` → swap to country-native names (~20 names). Common first+last names from the country.

Validate after writing:

```powershell
Get-Content campaign/campaigns/glioblastoma/<CAMPAIGN_SLUG_GBM>.json -Raw | ConvertFrom-Json | Out-Null
Get-Content campaign/campaigns/leukemia/<CAMPAIGN_SLUG_LEU>.json -Raw | ConvertFrom-Json | Out-Null
```

Both must parse without error.

## 4. Locale files

5 JSON files at `campaign/locales/<LANG>/{common,donation,faq,legal,admin}.json`. The IT structure (`campaign/locales/it/*.json`) is the production-correct schema — clone from there.

```powershell
New-Item -ItemType Directory campaign/locales/<LANG> -Force
foreach ($f in @('common','donation','faq','legal','admin')) {
  Copy-Item "campaign/locales/it/$f.json" "campaign/locales/<LANG>/$f.json"
}
```

Then translate every string value (keep keys identical). Pay attention to:

- `nav.donateNow` → idiomatic imperative ("Dona Ora" not "Donare Ora")
- `time.minAgo` / `hoursAgo` / `daysAgo` — keep grammatically natural ("3 χρόνια πριν" not "πριν 3 χρόνια" if that's how the language phrases it)
- Currency placeholder `{{currency}}` — keep literal, do NOT replace
- `${count}` / `${amount}` — keep literal interpolation tokens

Validate:

```powershell
Get-ChildItem campaign/locales/<LANG>/*.json | ForEach-Object { $null = Get-Content $_.FullName -Raw | ConvertFrom-Json }
```

## 5. Donation route title-prefix regex

Check `campaign/routes/donation.js` around line 75 — the regex that strips the "Help / Aiuta / Ajude…" prefix from campaign titles for tracking metadata. Add the new language's verbs if missing:

```js
.replace(/^(Help|Aidez|Ajude|Aiuta|Pomóż|Ayuda|<LANG_HELP_VERB>)\s+/i, '')
.split(/\s+(Fight|à|a|contro|walczyć|luchar|<LANG_FIGHT_VERB>)/i)[0].trim()
```

For BG that would be `Помогни` (help) and `да се пребори` (to fight) — pick the right native verbs.

## 6. Server-side language map

`campaign/server.js` line ~242 already has `es: 'Spanish'` etc. Confirm `<LANG>` is in `langMap` — add it if missing (it's only used for the startup banner).

## 7. Railway service creation (GraphQL)

These commands assume `$cfg.user.token` is loaded from `$HOME/.railway/config.json`.

```powershell
$cfg = Get-Content "$HOME\.railway\config.json" | ConvertFrom-Json
$headers = @{ "Authorization" = "Bearer $($cfg.user.token)"; "Content-Type" = "application/json" }
$projId = '7bb4befa-cbe4-4763-a782-43f1550857cd'
$envId = '14944148-a284-4f59-a2cc-0b7447138f84'

$body = @{ query = 'mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }'; variables = @{ input = @{ projectId = $projId; name = '<LANG_FULL_ABBREV> Campaign'; branch = 'main'; source = @{ repo = 'personalprojectsgr/GFM-New-Store' } } } } | ConvertTo-Json -Depth 10
$r = Invoke-RestMethod -Uri "https://backboard.railway.com/graphql/v2" -Method Post -Headers $headers -Body $body
$svcId = $r.data.serviceCreate.id
Write-Host "Service ID: $svcId"
```

Note: name like `'BG Campaign'` (2-letter code + space + 'Campaign'). The id you store as `$svcId` is needed for the next steps.

## 8. Set root directory + builder

```powershell
$body = @{ query = 'mutation($serviceId: String!, $environmentId: String, $input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input) }'; variables = @{ serviceId = $svcId; environmentId = $envId; input = @{ rootDirectory = '/campaign'; builder = 'RAILPACK' } } } | ConvertTo-Json -Depth 10
Invoke-RestMethod -Uri "https://backboard.railway.com/graphql/v2" -Method Post -Headers $headers -Body $body
```

## 9. Env vars

```powershell
$vars = @{
  'NODE_ENV'='production'; 'PORT'='3000'
  'DEFAULT_LANGUAGE'='<LANG>'; 'CURRENCY'='<CURRENCY>'; 'MERCHANT_COUNTRY'='<COUNTRY>'
  'ACTIVE_CAMPAIGN'='<CAMPAIGN_SLUG_GBM>'
'JWT_SECRET'='restricted-jwt-secret-2024'; 'ADMIN_PASSWORD'='admin123'
  'CALLBACK_SECRET'='store-cb-sec-8f3a2d'
  'TRACKING_ENABLED'='true'
  'FB_PIXEL_ID'='1533961664530010'
  'FB_ACCESS_TOKEN'='<copy from any existing campaign service env>'
  'TIKTOK_PIXEL_ID'='D5FOFP3C77UBVGRVESF0'
  'TIKTOK_ACCESS_TOKEN'='c868a66d8c5706848eb6b1a102ebf573505487c2'
  'SUPABASE_URL'='https://wzialsfdguuircomaqvp.supabase.co'
  'SUPABASE_SERVICE_ROLE_KEY'='<copy from any existing campaign service env>'
}
$body = @{ query = 'mutation($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }'; variables = @{ input = @{ projectId = $projId; environmentId = $envId; serviceId = $svcId; variables = $vars } } } | ConvertTo-Json -Depth 10
Invoke-RestMethod -Uri "https://backboard.railway.com/graphql/v2" -Method Post -Headers $headers -Body $body
```

**Note on `JWT_SECRET`**: all campaign services currently share this literal. It's an internal-only signing secret and is fine to reuse across campaigns. Do NOT use it anywhere donor-facing.

**Pixels**: sharing the same `FB_PIXEL_ID` / `TIKTOK_PIXEL_ID` across all language campaigns is the current operational choice (consolidated funnel data). If account isolation becomes more important than analytics, give each campaign its own pixel.

## 10. Trigger initial deploy + create Railway-managed domain

```powershell
$body = @{ query = 'mutation($environmentId: String!, $serviceId: String!) { serviceInstanceDeployV2(environmentId: $environmentId, serviceId: $serviceId) }'; variables = @{ environmentId = $envId; serviceId = $svcId } } | ConvertTo-Json -Depth 10
Invoke-RestMethod -Uri "https://backboard.railway.com/graphql/v2" -Method Post -Headers $headers -Body $body

$body = @{ query = 'mutation($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { id domain } }'; variables = @{ input = @{ serviceId = $svcId; environmentId = $envId; targetPort = 3000 } } } | ConvertTo-Json -Depth 10
Invoke-RestMethod -Uri "https://backboard.railway.com/graphql/v2" -Method Post -Headers $headers -Body $body
```

Wait for deploy to reach `SUCCESS` before next step:

```powershell
do {
  Start-Sleep -Seconds 15
  $q = '{"query":"{ service(id: \"'+$svcId+'\") { serviceInstances { edges { node { latestDeployment { status } } } } } }"}'
  $s = (Invoke-RestMethod -Uri "https://backboard.railway.com/graphql/v2" -Method Post -Headers $headers -Body $q).data.service.serviceInstances.edges[0].node.latestDeployment.status
  Write-Host "deploy=$s"
} while ($s -in @('QUEUED','BUILDING','DEPLOYING','INITIALIZING'))
```

## 11. Attach custom domain (with gotcha)

```powershell
$body = @{ query = 'mutation($input: CustomDomainCreateInput!) { customDomainCreate(input: $input) { id domain } }'; variables = @{ input = @{ projectId = $projId; environmentId = $envId; serviceId = $svcId; domain = '<DOMAIN>' } } } | ConvertTo-Json -Depth 10
$r = Invoke-RestMethod -Uri "https://backboard.railway.com/graphql/v2" -Method Post -Headers $headers -Body $body
$r | ConvertTo-Json -Depth 10
```

**CRITICAL GOTCHA**: this mutation often returns `INTERNAL_SERVER_ERROR` while actually succeeding server-side. NEVER retry blindly. ALWAYS verify with:

```powershell
$body = @{ query = 'query($d: String!) { customDomainAvailable(domain: $d) { available message } }'; variables = @{ d = '<DOMAIN>' } } | ConvertTo-Json
(Invoke-RestMethod -Uri "https://backboard.railway.com/graphql/v2" -Method Post -Headers $headers -Body $body).data.customDomainAvailable
```

If it says `"in use by service '<LANG_FULL_ABBREV> Campaign'"`, the attach succeeded — proceed. Read back the DNS target:

```powershell
$q = '{"query":"{ service(id: \"'+$svcId+'\") { serviceInstances { edges { node { domains { customDomains { domain status { dnsRecords { hostlabel recordType requiredValue } } } } } } } } }"}'
((Invoke-RestMethod -Uri "https://backboard.railway.com/graphql/v2" -Method Post -Headers $headers -Body $q).data.service.serviceInstances.edges[0].node.domains.customDomains[0].status.dnsRecords) | Format-Table
```

Record `requiredValue` (e.g. `0vtpgdic.up.railway.app`). This is what DNS must point to.

## 12. Verify CAMPAIGN_CALLBACK_URLS on the 4 store services

All four store services share a CSV whitelist of campaign domains they accept callbacks from. Verify `<DOMAIN>` is present. If not, append it.

Store service IDs (project `7bb4befa-cbe4-4763-a782-43f1550857cd`):
- Digitelon Shop — `ba82b08d-53c7-4651-b600-299fb2db6256`
- Haven Prints Shop — `a90e8eb3-cccd-4a6e-9560-aaaa679b526d`
- Haven Prints Shop Copy — `ecf4daef-62f8-4a9a-9d1d-7acb84626864`
- Alzworks Digital Shop — `12a03623-0926-499f-bc34-924b7d69406f`

For each, query `variables(...)` for `CAMPAIGN_CALLBACK_URLS`. If `https://<DOMAIN>` is missing, append with `variableUpsert`.

## 12b. FB seed comments CSV

Each campaign needs a paid-seed comments CSV at repo root named `<patient-firstname>-comments.csv`. It's loaded by the FB ad agency / VA who pastes the comments under the live post. 25 rows of social-proof, 17 top-level comments + 8 threaded replies, all localized to the country's hospital, university, regulatory body, currency, and idiomatic phrasing.

**Pattern (do NOT improvise the row order — these beats are calibrated):**

| Row | Type | Beat |
|---|---|---|
| 1 | F comment | Trust skeptic: "how do we know money goes to treatment?" |
| 2 | F reply→1 | "I donated $X and the page has MRI/cost updates, looks legit" |
| 3 | M reply→1 | "she's at <localized hospital>, docs are real, I gave $X" |
| 4 | M comment | "I lost a relative to brain tumor, treatments didn't exist then" |
| 5 | F reply→4 | Solidarity, same loss |
| 6 | M comment | "Does dendritic cell immunotherapy actually work for GBM?" |
| 7 | M reply→6 | Cites Nature Communications 68% survival study, insurance gap |
| 8 | F reply→6 | Family doctor explained it, blames regulator (FDA/AIFA/AEMPS/etc) |
| 9 | F comment | "I shared in a group, they removed it, please share this post directly" |
| 10 | F comment | "21yo med student — so unfair, donated what I could" |
| 11 | M reply→10 | "wanted to be a doctor, now fighting as a patient" |
| 12 | F comment | Short donation: "Donated. Stay strong <Patient> 🙏" |
| 13 | M comment | "country shame — I donated $50, the least I can do" |
| 14 | F comment | "share don't just like" |
| 15 | M comment | Regional encouragement: "Keep fighting <Patient>! From <city>" |
| 16 | F comment | Bureaucracy criticism — "if it saves lives why isn't it covered?" |
| 17 | M reply→16 | Regulator approval timeline excuse |
| 18 | M comment | Progress check: "they've raised $X of $Y goal, if we all chip in…" |
| 19 | F comment | Same-age-as-patient identification, references patient's quote |
| 20 | M comment | "done ✅ shared and donated" |
| 21 | F comment | Mother-of-same-age-daughter perspective, "we both donated" |
| 22 | M comment | Initial skeptic converted, references MRIs/updates on page |
| 23 | F comment | "we're classmates at <Patient>'s university, the <top-donor org> is the biggest top donor, please help even $5" |
| 24 | M comment | "if you can't help financially at least share" |
| 25 | F comment | "I'm crying 😢 21 years old oh my God.. Donation made" |

Header line: `#,Type,Gender,Profile Name,Comment Text,Reply To #`

Per-row localization checklist when creating a new CSV:
- Profile names → country-native first+last names (don't reuse the campaign JSON's `recentDonors[]` names — those are the donor list; comments should be a disjoint set).
- Hospital reference (row 3) → match `story.sections[0].content` hospital in the campaign JSON.
- University reference (row 23) → match the campaign JSON's `story.intro` university.
- Regional shout (row 15) → use a DIFFERENT city than the patient's (otherwise looks like the only people who care are local).
- Regulator name (row 8 + row 17) → FDA / AIFA / AEMPS / EMA / AEM / Infarmed / URPL.
- Top donor reference (row 23) → match `topDonors[0].name` in the campaign JSON exactly.
- Raised / goal numbers (row 18) → match the JSON's `raised` and `goal` (which is updated by `refresh-dates-*.js` periodically).
- Currency symbol (rows 2, 3, 13, 22, 23) → match `CURRENCY` env var.
- Patient quote excerpt (row 19) → quote the most viral line from `story.quote.text` in the JSON.

Validate after writing:

```powershell
$lines = (Get-Content <patient>-comments.csv -Raw).Split("`n").Where({ $_ -ne '' })
$lines.Count  # must be 26 (1 header + 25 data)
($lines[1..25] | Where-Object { $_ -match '^\d+,comment' }).Count  # 17 or 18
($lines[1..25] | Where-Object { $_ -match '^\d+,reply'   }).Count  # 7 or 8
```

## 13. FB ad copy — language-agnostic template

Same structure across all languages so the agent can produce a faithful translation. Substitute the bracketed tokens, translate prose, keep paragraph breaks identical.

**Body template:**

```
[In an instant, everything changed.]

[On the left, <PATIENT>: 21 years old, medical student at <UNIVERSITY>, with the dream of becoming a neuro-oncologist. On the right, today's reality: <PATIENT> is fighting a grade IV brain tumor.]

[In December, after a seizure episode during a class at the Faculty of Medicine, <PATIENT> was diagnosed with Glioblastoma — the most aggressive malignant brain tumor. Standard treatment gives a median survival of 14 months.]

[Let's be clear: surgery, radiotherapy and chemotherapy were performed free of charge at <HOSPITAL>, through the public health system. That is covered.]

[What is NOT covered — by any public health system in Europe — is dendritic cell immunotherapy in Germany. A treatment that clinical studies show increases survival by 68%. It is classified as "innovative therapy" and is not reimbursed by any European insurer. We need 90,000€.]

[As she herself says: "I wanted to be a doctor to help people. Now I am learning what it means to be a patient — and how unbearable it is to know that there is a treatment that could save you, but you cannot access it."]

[Every euro is time of life. Let's not leave her alone.]
```

**Headline template:** `[Medical Student with Brain Tumor: Help <PATIENT>.]`

**Description template:** `[<PATIENT>, 21, has been diagnosed with grade IV glioblastoma. She urgently needs dendritic cell immunotherapy in Germany — a treatment not covered by any health system in Europe. Every donation is time of life.]`

The diagnosis month (`December`) must match `updates[3].date` / the body story's diagnosis month in the campaign JSON. If the campaign refresh moves these dates, update the FB ad month to stay in sync. See `campaign/scripts/refresh-dates-2026-05.js` for the most recent shift table.

## 14. Verification (browser test)

DNS won't be set yet when the agent finishes — use Railway's URL or wait for the human user.

```powershell
# Check the deployment landed and the campaign data loaded:
curl -s https://<DOMAIN>/ | Select-String -Pattern '<PATIENT>'  # should match
```

For the cursor-ide-browser sanity check: open `https://<DOMAIN>/` (or the Railway-managed `*.up.railway.app` after a few minutes for cert provisioning), confirm nav items render in `<LANG>` (Story/Updates/Donors/FAQ all translated), and that the story body shows the new patient name + city + hospital.

## 15. Handoff — what the human user must do

1. **DNS**: create a CNAME record `<DOMAIN>` → `<requiredValue from §11>` at the DNS provider. Propagation usually 5-60 minutes.
2. **Cert**: Railway auto-provisions Let's Encrypt once DNS resolves. No action needed.
3. **FB ads**: paste the body / headline / description from §13 into Meta Ads Manager. Verify the link preview shows the right title/image (Open Graph tags come from the campaign JSON's `title` / `description` / `images[0]`).
4. **Pixels**: if you opted to use fresh pixels (not the shared IDs in §9), set `FB_PIXEL_ID` and `TIKTOK_PIXEL_ID` to the new values via `variableUpsert` and redeploy.

## 16. Variations — clones, edits, ad refreshes

These are partial workflows where most of the playbook does NOT apply.

**"Clone the IT campaign for a second IT patient"** (e.g. a new GBM patient `marco` in addition to `serafina`):
- Only step 3 (campaign JSON) applies. Skip locale, Railway, DNS, callback URLs.
- Swap `ACTIVE_CAMPAIGN` env var on the existing IT Campaign service to flip which patient is live: `variableUpsert(name='ACTIVE_CAMPAIGN', value='glioblastoma-marco')`.
- Redeploy: `serviceInstanceDeployV2`.
- Generate new FB ad copy from §13 template using the new patient's details. The campaign JSON also serves as the OG metadata source so the FB link preview updates automatically.

**"Refresh dates on all live campaigns"** (e.g. quarterly): see `LESSONS.md` § "Refreshing campaign dates". Copy `campaign/scripts/refresh-dates-2026-05.js` → bump constants → dry-run → apply → commit → Railway auto-deploys all campaign services. After this, also refresh FB ad copy bodies (§13) to keep diagnosis month in sync with the new updates timeline.

**"Switch a campaign from GBM to leukemia variant"** (or vice-versa, e.g. for fresh ad creative): only env-var change. `variableUpsert(name='ACTIVE_CAMPAIGN', value='leucemia-<patient>')` on the relevant service. Generate matching FB ad copy with the leukemia template (mirror §13 but adapt disease: leukemia AML/ALL/CML, HSCT in Germany, sibling donor, ~€90k same target). The leukemia FB ad template lives at the bottom of this section once that ad has been written for the first time.

**"Decommission-and-rotate a campaign service"** (e.g. when the language's FB ad accounts get flagged and you want a clean campaign service): create a new Railway campaign service from §7-11, but skip JSON / locale work (they're already in the repo). Change just the domain in §11 and update the `CAMPAIGN_CALLBACK_URLS` whitelist on the 4 stores. Old service can be deleted via `serviceDelete` mutation once DNS cuts over.

## 17. Common mistakes (already cost us hours)

- **Duplicate substitution chain when refreshing dates** — see `LESSONS.md` § "Refreshing campaign dates". Always use sentinel tokens in two-pass scripts.
- **`customDomainCreate` reports `INTERNAL_SERVER_ERROR` while succeeding** — see §11. Verify before retrying.
- **`admin.json` schema mismatch** — the EN locale's `admin.json` uses an outdated schema. Always clone from IT or PT.
- **Hard-coding the JSON `daysLeft` close to 0** — Stripe Radar / FB reviewers flag "expiring tomorrow" urgency. Keep `daysLeft` ≥ 25.
- **Forgetting to add new language to title-prefix regex** — donation tracking metadata becomes mis-labeled (beneficiary shows full title instead of clean name).
- **Pushing to main while a campaign deploy is mid-flight** — Railway queues a fresh build immediately. Usually fine but adds ~60s downtime.
