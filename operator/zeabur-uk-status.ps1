# Read-only inspection of the UK campaign service on Zeabur.
# Prints variable NAMES + the interesting non-secret values, attached domains,
# latest deployment. Never prints the Zeabur API key.
$ErrorActionPreference = 'Stop'
$k = ((Get-Content (Join-Path $PSScriptRoot "..\secrets\zeabur.env") | Select-String "ZEABUR_API_KEY").ToString() -split "=", 2)[1].Trim()

$S = "6acfea207741ff5769fb9e15"   # uk-campaign
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

$r1 = Gql 'query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ _id name variables(environmentID:$e){ key value } } }' @{ s = $S; e = $E }
if ($r1.errors) { "GRAPHQL ERRORS (variables):"; $r1.errors | ConvertTo-Json -Depth 5; }

$vars = $r1.data.service.variables
"service: $($r1.data.service.name)  varCount: $($vars.Count)"
""
"--- pixel / host / tracking variables (full values) ---"
$watch = 'FB_PIXEL_ID','ALLOWED_CAMPAIGN_HOSTS','CAPI_SOURCE_DOMAIN','TRACKING_ENABLED','MARKET_CODE','CURRENCY','MERCHANT_COUNTRY','ACTIVE_CAMPAIGN','CONVERSION_MODE','FB_TEST_EVENT_CODE'
foreach ($key in $watch) {
  $hit = $vars | Where-Object { $_.key -eq $key }
  if ($hit) { "$key = $($hit.value)" } else { "$key = <absent>" }
}
""
"--- every variable name present ---"
($vars | ForEach-Object { $_.key } | Sort-Object) -join ', '
""
"--- any other pixel-ish variables ---"
$vars | Where-Object { $_.key -match 'PIXEL|TIKTOK|CAPI|FB_' -and $watch -notcontains $_.key } | ForEach-Object {
  $v = $_.value
  if ($_.key -match 'TOKEN|SECRET|KEY') { "$($_.key) = <$($v.Length) chars>" } else { "$($_.key) = $v" }
}
""
"--- attached domains ---"
$r2 = Gql 'query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ domains(environmentID:$e){ domain isGenerated } } }' @{ s = $S; e = $E }
if ($r2.errors) { $r2.errors | ConvertTo-Json -Depth 5 } else { $r2.data.service.domains | ForEach-Object { "$($_.domain)  generated=$($_.isGenerated)" } }
""
"--- latest deployments ---"
$r3 = Gql 'query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ deployments(environmentID:$e){ _id status createdAt } } }' @{ s = $S; e = $E }
if ($r3.errors) { $r3.errors | ConvertTo-Json -Depth 5 } else { $r3.data.service.deployments | Select-Object -First 3 | ForEach-Object { "$($_.status)  $($_.createdAt)" } }
