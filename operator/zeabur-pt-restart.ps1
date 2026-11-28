$ErrorActionPreference = 'Stop'
$k = ((Get-Content (Join-Path $PSScriptRoot "..\secrets\zeabur.env") | Select-String "ZEABUR_API_KEY").ToString() -split "=", 2)[1].Trim()
$E = "6acfe8b299b42396d4a013e7"
$PT = "6acfea2a7741ff5769fb9e1b"
function Gql($q, $vars) {
  $body = @{ query = $q; variables = $vars } | ConvertTo-Json -Depth 8 -Compress
  $tmp = [IO.Path]::GetTempFileName(); [IO.File]::WriteAllText($tmp, $body)
  try { return (curl.exe -s -X POST "https://api.zeabur.com/graphql" -H "Authorization: Bearer $k" -H "Content-Type: application/json" --data-binary "@$tmp") | ConvertFrom-Json }
  finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
}
# restartService returns Boolean -> no subfield selection
$r = Gql 'mutation($s:ObjectID!,$e:ObjectID!){ restartService(serviceID:$s,environmentID:$e) }' @{ s = $PT; e = $E }
if ($r.errors) { "ERR"; $r.errors | ConvertTo-Json -Depth 5 } else { "restart requested: $($r.data.restartService)" }
