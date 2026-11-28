# Read-only: pt-campaign variables + uk-campaign host allowlist for comparison.
$ErrorActionPreference = 'Stop'
$k = ((Get-Content (Join-Path $PSScriptRoot "..\secrets\zeabur.env") | Select-String "ZEABUR_API_KEY").ToString() -split "=", 2)[1].Trim()
$E = "6acfe8b299b42396d4a013e7"

function Gql($q, $vars) {
  $body = @{ query = $q; variables = $vars } | ConvertTo-Json -Depth 6 -Compress
  $tmp = [IO.Path]::GetTempFileName()
  [IO.File]::WriteAllText($tmp, $body)
  try {
    $r = curl.exe -s -X POST "https://api.zeabur.com/graphql" -H "Authorization: Bearer $k" -H "Content-Type: application/json" --data-binary "@$tmp"
    return $r | ConvertFrom-Json
  } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
}

foreach ($pair in @(@{n='pt-campaign';s='6acfea2a7741ff5769fb9e1b'}, @{n='uk-campaign';s='6acfea207741ff5769fb9e15'})) {
  "===== $($pair.n) ====="
  $r = Gql 'query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ _id name variables(environmentID:$e){ key value } domains(environmentID:$e){ domain isGenerated } } }' @{ s = $pair.s; e = $E }
  if ($r.errors) { "GRAPHQL ERROR"; $r.errors | ConvertTo-Json -Depth 5; continue }
  $vars = $r.data.service.variables
  "varCount: $($vars.Count)"
  foreach ($key in 'FB_PIXEL_ID','FB_AD_ACCOUNT_ID','ALLOWED_CAMPAIGN_HOSTS','CAPI_SOURCE_DOMAIN','MARKET_CODE','CURRENCY','MERCHANT_COUNTRY','ACTIVE_CAMPAIGN','TRACKING_ENABLED','PORT','DEFAULT_LANGUAGE') {
    $hit = $vars | Where-Object { $_.key -eq $key }
    if ($hit) { "  $key = $($hit.value)" } else { "  $key = <ABSENT>" }
  }
  "  all keys: " + (($vars | ForEach-Object { $_.key } | Sort-Object) -join ', ')
  "  domains: " + (($r.data.service.domains | ForEach-Object { $_.domain + '(gen=' + $_.isGenerated + ')' }) -join ', ')
  ""
}
