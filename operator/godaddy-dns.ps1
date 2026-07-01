# GoDaddy DNS helper. Credentials: ../secrets/godaddy.env (gitignored).
# Usage:
#   .\godaddy-dns.ps1 list-domains
#   .\godaddy-dns.ps1 get-records -Domain larkwellhome.online
#   .\godaddy-dns.ps1 set-cname -Domain larkwellhome.online -RecordName www -Target 0fxuv8ut.up.railway.app
#   .\godaddy-dns.ps1 set-txt   -Domain larkwellhome.online -RecordName _railway-verify -Value "railway-verify=abc..."
#   .\godaddy-dns.ps1 del-record -Domain larkwellhome.online -RecordName www -Type CNAME
#
# GoDaddy cannot CNAME the apex (@). Use www.<domain> as canonical host for Railway
# store deploys (matches every live store in Supabase). Forward apex -> www in the
# GoDaddy dashboard if bare-domain hits matter (not API-supported).

param(
  [Parameter(Position=0, Mandatory=$true)][string]$Command,
  [string]$Domain,
  [string]$RecordName,
  [string]$Type,
  [string]$Target,
  [string]$Value,
  [int]$Ttl = 600
)

$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot "..\secrets\godaddy.env"
if (-not (Test-Path $envFile)) { throw "Missing $envFile" }
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $kv = $line -split '=', 2
    Set-Item -Path ("Env:" + $kv[0].Trim()) -Value $kv[1].Trim()
  }
}
if (-not $env:GODADDY_API_KEY -or -not $env:GODADDY_API_SECRET) { throw "GODADDY_API_KEY / GODADDY_API_SECRET missing" }

$base = if ($env:GODADDY_API_BASE) { $env:GODADDY_API_BASE } else { "https://api.godaddy.com/v1" }
$auth = "sso-key $($env:GODADDY_API_KEY):$($env:GODADDY_API_SECRET)"
$headers = @{ Authorization = $auth; "Content-Type" = "application/json" }

function ToJsonArray($items) {
  if ($items -isnot [array]) { $items = @($items) }
  ConvertTo-Json -InputObject $items -Depth 10 -Compress
}
function ApiGet($path) { Invoke-RestMethod -Uri "$base$path" -Headers $headers -Method Get }
function ApiPatch($path, $items) {
  Invoke-RestMethod -Uri "$base$path" -Headers $headers -Method Patch -Body (ToJsonArray $items)
}
function ApiPut($path, $items) {
  Invoke-RestMethod -Uri "$base$path" -Headers $headers -Method Put -Body (ToJsonArray $items)
}

switch ($Command.ToLower()) {
  "list-domains" {
    ApiGet "/domains?statuses=ACTIVE" | Select-Object domain, status, expires | Format-Table -AutoSize
  }
  "get-records" {
    if (-not $Domain) { throw "-Domain required" }
    ApiGet "/domains/$Domain/records" | Select-Object type, name, data, ttl | Format-Table -AutoSize
  }
  "set-cname" {
    if (-not $Domain -or -not $RecordName -or -not $Target) { throw "-Domain -RecordName -Target required" }
    ApiPut "/domains/$Domain/records/CNAME/$RecordName" @(@{ type = "CNAME"; name = $RecordName; data = $Target; ttl = $Ttl })
    Write-Output "OK CNAME $RecordName.$Domain -> $Target"
  }
  "set-txt" {
    if (-not $Domain -or -not $RecordName -or -not $Value) { throw "-Domain -RecordName -Value required" }
    ApiPut "/domains/$Domain/records/TXT/$RecordName" @(@{ type = "TXT"; name = $RecordName; data = $Value; ttl = $Ttl })
    Write-Output "OK TXT $RecordName.$Domain"
  }
  "del-record" {
    if (-not $Domain -or -not $RecordName -or -not $Type) { throw "-Domain -RecordName -Type required" }
    Invoke-RestMethod -Uri "$base/domains/$Domain/records/$Type/$RecordName" -Headers $headers -Method Delete
    Write-Output "OK deleted $Type $RecordName.$Domain"
  }
  default { throw "Unknown: $Command. Use list-domains, get-records, set-cname, set-txt, del-record" }
}
