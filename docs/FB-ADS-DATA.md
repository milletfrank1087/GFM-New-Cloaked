# FB Ads Data Fetch Protocol

How to query Facebook Ads data from this project. All requests go through a residential proxy for IP stability.

## Architecture

The FB ads manager lives at `C:\Users\iakwv\Downloads\FB ads manager\` — a separate project with its own Node/Express dashboard. This doc teaches agents in the GFM Cloaked project how to query the same Meta Graph API using the same proxy and credentials.

## Credentials (from FB ads manager `.env`)

All credentials live in `C:\Users\iakwv\Downloads\FB ads manager\.env`. Read at runtime — NEVER hardcode tokens in this repo.

| Variable | Notes |
|----------|-------|
| `FB_SYSTEM_USER_ACCESS_TOKEN` | Never-expiring system user token (43 scopes) |
| `FB_APP_SECRET` | Required for `appsecret_proof` HMAC |
| `FB_APP_ID` | `974273918718391` |
| `FB_PRIMARY_ACCOUNT_ID` | `act_1622353565055773` (GFM Greece) |
| `FB_ADDITIONAL_ACCOUNT_IDS` | `act_1388808955587972` (GFM Italy) — comma-separated list for multi-account monitoring |
| `PROXY_HOST/PORT/USER/PASS` | Residential proxy for stable egress IP |
| `GRAPH_API_VERSION` | `v25.0` |

## What the Token Can Access

**Identity:** System user `fb-ads-manager-sysuser` (id: `122099203467342360`) under BM `reddingtonv6` (id: `1162517778681857`).

**43 scopes** including: `ads_management`, `ads_read`, `read_insights`, `business_management`, `pages_read_engagement`, `pages_manage_engagement`, `pages_manage_posts`, `pages_read_user_content`, `catalog_management`, `leads_retrieval`, `instagram_basic`, `instagram_manage_comments`, `instagram_content_publish`.

### Ad Accounts (5 owned)

| Account ID | Name | Status | Currency | Notes |
|-----------|------|--------|----------|-------|
| `act_1622353565055773` | GFM Greece | Active (1) | USD | Primary — $23k+ spent, 2 active campaigns |
| `act_616824728131340` | Bucket Acc | Active (1) | USD | Legacy ecom (all paused) |
| `act_564815712729835` | GFM Germany | Active (1) | USD | $0 spent (dormant) |
| `act_1388808955587972` | GFM Italy | Active (1) | USD | Legacy campaigns (all paused) |
| `act_581209504462976` | GFM Backup | Disabled (2) | USD | disable_reason=1 (policy) |

### Currently Active Campaigns (GFM Greece)

| Campaign | Objective | Active Ad Sets |
|----------|----------|---------------|
| **GBM Grace - UK** (`120244462464820464`) | OUTCOME_SALES | 1: `($50/day) UK - Broad - Volume - Comments` (Lowest Cost, OFFSITE_CONVERSIONS) |
| **GBM Emily - USA** (`120243600916970464`) | OUTCOME_SALES | 1: `($75/day) US - Broad - Volume - Comments` (Lowest Cost, OFFSITE_CONVERSIONS) |

27 campaigns total on this account (25 paused). Mix of GFM geo campaigns, Helix Research, Aether Labs, Subscriptions.

### MTD Performance (Jul 2026, GFM Greece)

| Metric | Value |
|--------|-------|
| Spend | $1,397.54 |
| Impressions | 32,911 |
| Reach | 27,508 |
| Purchases (omni) | 253 |
| Purchase Value | $6,817.62 |
| **ROAS** | **4.88x** |

### Page

`113297813778299` — **RiseHope** (facebook.com/113297813778299). Page token is minted at runtime from the system user token.

### Pixels (10 on account)

| Pixel | Last Fired | Notes |
|-------|-----------|-------|
| GFM Improved (`1533961664530010`) | Jul 13 2026 | Active, CAPI confirmed (~52% server events) |
| SweetFactoryOfficial (`1362846658281690`) | Jun 22 2026 | Active |
| Helix Research (`972282822070778`) | Jun 12 2026 | Active |
| Others | Pre-2026 | Dormant |

### Custom Audiences

| Audience | Type | Approximate Size |
|----------|------|-----------------|
| Lookalike (1%) - GFM Improved - Website Purchase | LOOKALIKE | ~1,000 |
| PUR180 (180-day purchasers) | WEBSITE | ~20 |

## Non-Negotiable Rules

1. **ALWAYS use the proxy.** Every request to `graph.facebook.com` MUST go through `PROXY_HOST:PROXY_PORT`. No exceptions, no fallbacks, no retries without proxy.
2. **ALWAYS include `appsecret_proof`.** HMAC-SHA256 of the access token using `FB_APP_SECRET` as the key.
3. **750ms minimum gap** between consecutive requests (+ random jitter).
4. **Max 500 calls/day** per account-timezone day.
5. **Back off at 80% usage** (from `x-business-use-case-usage` header). Stop at 90%.

## PowerShell: Quick Query Recipe

Use `curl.exe` (not `Invoke-RestMethod`) — PowerShell's `Invoke-RestMethod` has CONNECT-tunnel proxy auth issues with residential proxies; `curl.exe` handles it natively.

```powershell
# Load credentials from FB ads manager .env
$envFile = Get-Content "C:\Users\iakwv\Downloads\FB ads manager\.env" -Raw
function Get-EnvVal($key) {
    if ($envFile -match "(?m)^${key}=(.+)$") { return $Matches[1].Trim() }
    return $null
}

$token = Get-EnvVal 'FB_SYSTEM_USER_ACCESS_TOKEN'
$appSecret = Get-EnvVal 'FB_APP_SECRET'
$proxyHost = Get-EnvVal 'PROXY_HOST'
$proxyPort = Get-EnvVal 'PROXY_PORT'
$proxyUser = Get-EnvVal 'PROXY_USER'
$proxyPass = Get-EnvVal 'PROXY_PASS'
$accountId = 'act_1622353565055773'
$version = 'v25.0'

# Compute appsecret_proof (HMAC-SHA256 of token with app_secret)
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($appSecret)
$proof = ($hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($token)) | ForEach-Object { $_.ToString("x2") }) -join ''

# Query function — uses curl.exe through the proxy
function Invoke-GraphApi {
    param([string]$Endpoint, [string]$ExtraParams = '')
    $url = "https://graph.facebook.com/${version}/${Endpoint}?access_token=${token}&appsecret_proof=${proof}${ExtraParams}"
    $raw = curl.exe --proxy "http://${proxyHost}:${proxyPort}" --proxy-user "${proxyUser}:${proxyPass}" -s "$url"
    $raw | ConvertFrom-Json
}
```

## Common Queries

### Today's campaign insights
```powershell
$fields = 'campaign_id,campaign_name,spend,impressions,reach,actions,action_values,cost_per_action_type,purchase_roas,cpm,cpc,ctr'
Invoke-GraphApi "$accountId/insights" "&level=campaign&date_preset=today&fields=$fields"
```

### Last 7 days
```powershell
$fields = 'campaign_id,campaign_name,spend,impressions,reach,actions,action_values,cost_per_action_type,purchase_roas'
Invoke-GraphApi "$accountId/insights" "&level=campaign&date_preset=last_7d&fields=$fields"
```

### Daily breakdown (time series)
```powershell
$fields = 'campaign_id,campaign_name,date_start,date_stop,spend,impressions,actions,action_values'
Invoke-GraphApi "$accountId/insights" "&level=campaign&date_preset=last_7d&time_increment=1&fields=$fields"
```

### Ad set level with budgets
```powershell
Invoke-GraphApi "$accountId/adsets" "&fields=id,name,status,daily_budget,lifetime_budget,campaign_id,bid_strategy,optimization_goal,targeting&limit=100"
```

### Campaign entities (status, objective)
```powershell
Invoke-GraphApi "$accountId/campaigns" "&fields=id,name,status,objective,daily_budget,lifetime_budget,buying_type&limit=100"
```

### Age/gender breakdown
```powershell
Invoke-GraphApi "$accountId/insights" "&level=campaign&date_preset=last_7d&breakdowns=age,gender&fields=campaign_name,age,gender,spend,impressions,actions,action_values"
```

### Country breakdown
```powershell
Invoke-GraphApi "$accountId/insights" "&level=campaign&date_preset=last_7d&breakdowns=country&fields=campaign_name,country,spend,impressions,actions,action_values"
```

## Conversion Attribution Rules (CRITICAL)

Meta emits redundant `action_type` names. Do NOT sum all — use these mutually exclusive matchers:

| Column | action_type matcher | What it counts |
|--------|-------------------|----------------|
| **Total** | `omni_purchase` | All sources, deduplicated by Meta |
| **Website** | `offsite_conversion.fb_pixel_purchase` | Pixel-tracked only |
| **In-app** | `mobile_app_purchase` | Advertiser's app only |
| **Meta-native** | `onsite_conversion.purchase` | FB/IG Shops |

The source-breakdown columns may NOT sum to Total — this is correct (a purchase tracked via both Pixel AND CAPI is counted once in `omni_purchase`).

**ROAS:** use `purchase_roas` array → entry with `action_type == 'omni_purchase'`. Never sum the array.

## Rate Limit Headers to Watch

| Header | What it tells you |
|--------|------------------|
| `x-app-usage` | App-level usage % (call_count, total_time, total_cputime) |
| `x-business-use-case-usage` | Per-account, per-BUC-type usage with `estimated_time_to_regain_access` |
| `x-fb-ads-insights-throttle` | Insights-specific throttle + `ads_api_access_tier` |

Rate limit error codes: `4`, `17`, `32`, `613`, `80000`-`80004`. On any: stop for 60min (or use `estimated_time_to_regain_access`).

## Field Expansion (saves quota)

Combine sub-resources in one call:
```
/{ad-id}?fields=id,name,creative{id,object_story_id,thumbnail_url},adset{id,name,daily_budget},campaign{id,objective}
```
Counts as 1 call, not N. This is the biggest rate-limit lever.

## Batching

Up to 50 ops per `POST /` with `batch=[...]`. Each sub-op counts toward rate limits (saves HTTP round-trips, not quota). Use `include_headers=true` for insights batches to get per-sub-op throttle data.

Do NOT put multiple adsets from the same campaign in one batch (Meta rejects the whole batch).

## Valid date_preset Values

`today`, `yesterday`, `this_month`, `last_month`, `this_quarter`, `maximum`, `data_maximum`, `last_3d`, `last_7d`, `last_14d`, `last_28d`, `last_30d`, `last_90d`, `last_week_mon_sun`, `last_week_sun_sat`, `last_quarter`, `last_year`, `this_week_mon_today`, `this_week_sun_today`, `this_year`
