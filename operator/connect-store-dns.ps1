# One-shot: wire a GoDaddy store domain to its Railway service.
# Pattern used by all live stores: canonical host is www.<apex>, not apex.
#
# Usage:
#   .\connect-store-dns.ps1 -ServiceName "Larkwell Home Shop" -ApexDomain larkwellhome.online -StoreSlug larkwell-home
#   .\connect-store-dns.ps1 -ServiceName "Larkwell Home Shop" -ApexDomain larkwellhome.online -StoreSlug larkwell-home -SkipSupabase
#   .\connect-store-dns.ps1 -ServiceName "OptimiSystems Shop" -ApexDomain optimisystems.store -DryRun
#
# Requires: secrets/godaddy.env, ~/.railway/config.json

param(
  [Parameter(Mandatory=$true)][string]$ServiceName,
  [Parameter(Mandatory=$true)][string]$ApexDomain,
  [string]$StoreSlug,
  [switch]$SkipSupabase,
  [switch]$Recreate,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "railway-api.ps1")

$canonical = "www.$ApexDomain"

Write-Output "=== connect-store-dns ==="
Write-Output "service=$ServiceName apex=$ApexDomain canonical=$canonical"

$svc = Get-RailwayServiceByName -Name $ServiceName
$si = ($svc.serviceInstances.edges | Select-Object -First 1).node
$existing = $si.domains.customDomains | Where-Object { $_.domain -eq $canonical -or $_.domain -eq $ApexDomain }

$cd = $existing | Where-Object { $_.domain -eq $canonical } | Select-Object -First 1
if ($cd -and $Recreate) {
  Write-Output "Recreate: deleting existing custom domain $($cd.domain)..."
  if (-not $DryRun) { Remove-RailwayCustomDomain -DomainId $cd.id }
  $cd = $null
}
if (-not $cd) {
  $wrong = $existing | Where-Object { $_.domain -eq $ApexDomain } | Select-Object -First 1
  if ($wrong) {
    Write-Output "Removing apex custom domain $($wrong.domain) (GoDaddy cannot CNAME apex)..."
    if (-not $DryRun) { Remove-RailwayCustomDomain -DomainId $wrong.id }
  }
  Write-Output "Creating Railway custom domain $canonical ..."
  if ($DryRun) { throw "DryRun: would create $canonical on Railway" }
  $cd = New-RailwayCustomDomain -ServiceId $svc.id -Domain $canonical
}

$cnameRec = $cd.status.dnsRecords | Where-Object { $_.recordType -eq "DNS_RECORD_TYPE_CNAME" -or $_.purpose -eq "DNS_RECORD_PURPOSE_TRAFFIC_ROUTE" } | Select-Object -First 1
$txtRec = $cd.status.dnsRecords | Where-Object { $_.recordType -eq "DNS_RECORD_TYPE_TXT" -or $_.purpose -match "VERIFY" } | Select-Object -First 1

if (-not $cnameRec) { throw "Railway did not return a CNAME requirement for $canonical" }
$cnameTarget = $cnameRec.requiredValue
$verifyValue = if ($txtRec) { $txtRec.requiredValue } else { $null }

Write-Output ""
Write-Output "Railway requires:"
Write-Output "  CNAME www -> $cnameTarget"
if ($verifyValue) { Write-Output "  TXT _railway-verify -> $verifyValue" }
Write-Output "  verified=$($cd.status.verified) cert=$($cd.status.certificateStatus)"
Write-Output "  cname status=$($cnameRec.status) cur=$($cnameRec.currentValue)"

if ($DryRun) {
  Write-Output "DryRun — no DNS changes applied"
  exit 0
}

Write-Output ""
Write-Output "Applying GoDaddy records..."
& (Join-Path $PSScriptRoot "godaddy-dns.ps1") set-cname -Domain $ApexDomain -RecordName www -Target $cnameTarget -Ttl 1800
if ($verifyValue) {
  & (Join-Path $PSScriptRoot "godaddy-dns.ps1") set-txt -Domain $ApexDomain -RecordName _railway-verify -Value $verifyValue -Ttl 1800
  & (Join-Path $PSScriptRoot "godaddy-dns.ps1") set-txt -Domain $ApexDomain -RecordName "_railway-verify.www" -Value $verifyValue -Ttl 3600
}

Write-Output ""
Write-Output "Updating STORE_DOMAIN=$canonical on Railway..."
Set-RailwayVariable -ServiceId $svc.id -Name "STORE_DOMAIN" -Value $canonical

if ($StoreSlug -and -not $SkipSupabase) {
  Write-Output "Update Supabase manually or via MCP:"
  Write-Output "  UPDATE stores SET domain='$canonical' WHERE slug='$StoreSlug';"
}

Write-Output ""
Write-Output "Done. SSL issues in 5-15 min after DNS propagates."
Write-Output "Verify: curl -I https://$canonical/"
Write-Output "Apex ($ApexDomain) stays parked — set GoDaddy forwarding apex->https://$canonical if needed."
