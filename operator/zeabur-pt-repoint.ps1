# Read-merge-write: point pt-campaign at the new GFM pixel, the new ad account,
# the UK service's working token, and enable ad sync. Full map is re-sent because
# updateEnvironmentVariable REPLACES the whole variable set.
$ErrorActionPreference = 'Stop'
$k = ((Get-Content (Join-Path $PSScriptRoot "..\secrets\zeabur.env") | Select-String "ZEABUR_API_KEY").ToString() -split "=", 2)[1].Trim()
$E = "6acfe8b299b42396d4a013e7"
$PT = "6acfea2a7741ff5769fb9e1b"
$UK = "6acfea207741ff5769fb9e15"

function Gql($q, $vars) {
  $body = @{ query = $q; variables = $vars } | ConvertTo-Json -Depth 8 -Compress
  $tmp = [IO.Path]::GetTempFileName(); [IO.File]::WriteAllText($tmp, $body)
  try { return (curl.exe -s -X POST "https://api.zeabur.com/graphql" -H "Authorization: Bearer $k" -H "Content-Type: application/json" --data-binary "@$tmp") | ConvertFrom-Json }
  finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
}

$q = 'query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ variables(environmentID:$e){ key value } } }'
$r = Gql $q @{ s = $PT; e = $E }
if ($r.errors) { throw "read failed: $($r.errors | ConvertTo-Json -Depth 5)" }
$vars = $r.data.service.variables
"read $($vars.Count) variables from pt-campaign"

$ukTok = ((Gql $q @{ s = $UK; e = $E }).data.service.variables | Where-Object { $_.key -eq 'FB_ACCESS_TOKEN' }).value
if (-not $ukTok) { throw "could not read uk token" }

# Build the map, folding duplicate keys (the service carries a few).
$map = [ordered]@{}
foreach ($v in $vars) { $map[$v.key] = $v.value }
$before = @{ pixel = $map['FB_PIXEL_ID']; acct = $map['FB_AD_ACCOUNT_ID']; sync = $map['ADS_SYNC_ENABLED']; tok = $map['FB_ACCESS_TOKEN'].Substring(0,12) }

$map['FB_PIXEL_ID']          = '1130405372925347'
$map['FB_AD_ACCOUNT_ID']     = 'act_3936327343175633'
$map['ADS_SYNC_ENABLED']     = 'true'
$map['FB_ACCESS_TOKEN']      = $ukTok
if (-not $map.Contains('CALLBACK_SECRET')) { throw 'CALLBACK_SECRET missing - abort' }
if ($map['PORT'] -ne '3000') { throw "PORT is $($map['PORT']) - abort" }

"before: pixel=$($before.pixel) acct=$($before.acct) sync='$($before.sync)' token=$($before.tok)"
"after : pixel=1130405372925347 acct=act_3936327343175633 sync=true token=$($ukTok.Substring(0,12))"
"sending $($map.Count) variables"

$mut = 'mutation($s:ObjectID!,$e:ObjectID!,$d:Map!){ updateEnvironmentVariable(serviceID:$s,environmentID:$e,data:$d) }'
$res = Gql $mut @{ s = $PT; e = $E; d = $map }
if ($res.errors) { "MUTATION ERRORS:"; $res.errors | ConvertTo-Json -Depth 6 } else { "mutation ok" }

$check = (Gql $q @{ s = $PT; e = $E }).data.service.variables
"verify: count=$($check.Count) pixel=$(($check | Where-Object { $_.key -eq 'FB_PIXEL_ID' }).value) acct=$(($check | Where-Object { $_.key -eq 'FB_AD_ACCOUNT_ID' }).value) sync=$(($check | Where-Object { $_.key -eq 'ADS_SYNC_ENABLED' }).value) port=$(($check | Where-Object { $_.key -eq 'PORT' }).value) hosts=$(($check | Where-Object { $_.key -eq 'ALLOWED_CAMPAIGN_HOSTS' }).value)"
