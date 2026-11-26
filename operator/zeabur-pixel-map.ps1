# Read-only: which campaign services point at which pixel, ad account and host.
$ErrorActionPreference = 'Stop'
$k = ((Get-Content (Join-Path $PSScriptRoot "..\secrets\zeabur.env") | Select-String "ZEABUR_API_KEY").ToString() -split "=", 2)[1].Trim()
$E = "6acfe8b299b42396d4a013e7"
$map = Get-Content (Join-Path $PSScriptRoot "..\secrets\zeabur-services.json") -Raw | ConvertFrom-Json |
  Where-Object { $_.name -match 'campaign|impact|larkwell' }

function Gql($q, $vars) {
  $body = @{ query = $q; variables = $vars } | ConvertTo-Json -Depth 6 -Compress
  $tmp = [IO.Path]::GetTempFileName()
  [IO.File]::WriteAllText($tmp, $body)
  try {
    $r = curl.exe -s -X POST "https://api.zeabur.com/graphql" -H "Authorization: Bearer $k" -H "Content-Type: application/json" --data-binary "@$tmp"
    return $r | ConvertFrom-Json
  } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
}

foreach ($s in $map) {
  $r = Gql 'query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ variables(environmentID:$e){ key value } } }' @{ s = $s.serviceID; e = $E }
  if ($r.errors) { "$($s.name): ERROR"; continue }
  $v = $r.data.service.variables
  $pixel = ($v | Where-Object { $_.key -eq 'FB_PIXEL_ID' } | Select-Object -First 1).value
  $acct = ($v | Where-Object { $_.key -eq 'FB_AD_ACCOUNT_ID' } | Select-Object -First 1).value
  $mkt = ($v | Where-Object { $_.key -eq 'MARKET_CODE' } | Select-Object -First 1).value
  $camp = ($v | Where-Object { $_.key -eq 'ACTIVE_CAMPAIGN' } | Select-Object -First 1).value
  "{0,-20} pixel={1,-18} acct={2,-26} market={3,-4} campaign={4}" -f $s.name, $pixel, $acct, $mkt, $camp
}
