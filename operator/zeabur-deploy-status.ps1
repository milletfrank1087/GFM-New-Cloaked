param([string]$Out = "deploy-status.json")

$k = ((Get-Content (Join-Path $PSScriptRoot "..\secrets\zeabur.env") | Select-String "ZEABUR_API_KEY").ToString() -split "=", 2)[1].Trim()
$P = "6acfe8b2c25afca66dfe5f87"
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

$svcs = (Gql 'query($p:ObjectID!){ project(_id:$p){ services { _id name } } }' @{ p = $P }).data.project.services
$rows = foreach ($s in $svcs) {
  $d = (Gql 'query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ deployments(environmentID:$e) { _id status createdAt } } }' @{ s = $s._id; e = $E }).data.service.deployments | Select-Object -First 1
  [pscustomobject]@{
    service   = $s.name
    status    = $d.status
    createdAt = $d.createdAt
    ageMin    = if ($d.createdAt) { [math]::Round(((Get-Date).ToUniversalTime() - ([datetime]$d.createdAt).ToUniversalTime()).TotalMinutes, 1) } else { $null }
  }
}

$rows | Sort-Object service | Format-Table -AutoSize
$rows | ConvertTo-Json -Depth 4 | Set-Content $Out
