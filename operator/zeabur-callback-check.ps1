# Read-only: larkwell-home callback hosts + token reachability check per service.
$ErrorActionPreference = 'Stop'
$k = ((Get-Content (Join-Path $PSScriptRoot "..\secrets\zeabur.env") | Select-String "ZEABUR_API_KEY").ToString() -split "=", 2)[1].Trim()
$E = "6acfe8b299b42396d4a013e7"
function Gql($q, $vars) {
  $body = @{ query = $q; variables = $vars } | ConvertTo-Json -Depth 6 -Compress
  $tmp = [IO.Path]::GetTempFileName(); [IO.File]::WriteAllText($tmp, $body)
  try { return (curl.exe -s -X POST "https://api.zeabur.com/graphql" -H "Authorization: Bearer $k" -H "Content-Type: application/json" --data-binary "@$tmp") | ConvertFrom-Json }
  finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
}
$svc = Get-Content (Join-Path $PSScriptRoot "..\secrets\zeabur-services.json") -Raw | ConvertFrom-Json
$lk = $svc | Where-Object { $_.name -eq 'larkwell-home' } | Select-Object -First 1
"larkwell-home serviceID: $($lk.serviceID)"
$r = Gql 'query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ variables(environmentID:$e){ key value } } }' @{ s = $lk.serviceID; e = $E }
$cb = ($r.data.service.variables | Where-Object { $_.key -eq 'CAMPAIGN_CALLBACK_URLS' }).value
"has ptw: " + ($cb -match 'ptw')
"has ukw: " + ($cb -match 'ukw')
"hosts count: " + (($cb -split ',').Count)
($cb -split ',') | ForEach-Object { "   $_" }

""
"--- token comparison (prefix only) ---"
foreach ($pair in @(@{n='pt';s='6acfea2a7741ff5769fb9e1b'}, @{n='uk';s='6acfea207741ff5769fb9e15'})) {
  $t = Gql 'query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ variables(environmentID:$e){ key value } } }' @{ s = $pair.s; e = $E }
  $v = ($t.data.service.variables | Where-Object { $_.key -eq 'FB_ACCESS_TOKEN' }).value
  $sec = ($t.data.service.variables | Where-Object { $_.key -eq 'FB_APP_SECRET' }).value
  $ads = ($t.data.service.variables | Where-Object { $_.key -eq 'ADS_SYNC_ENABLED' }).value
  "$($pair.n): tokenLen=$($v.Length) sameAsUkMarker=$($v.Substring(0,12)) appSecret=$([bool]$sec) adsSync=$ads"
}
