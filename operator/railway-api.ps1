# Shared Railway GraphQL helper. Token: ~/.railway/config.json
# Dot-source: . .\railway-api.ps1

$script:RailwayProjectId = "7bb4befa-cbe4-4763-a782-43f1550857cd"
$script:RailwayEnvironmentId = "14944148-a284-4f59-a2cc-0b7447138f84"

function Get-RailwayToken {
  $cfgPath = Join-Path $env:USERPROFILE ".railway\config.json"
  if (-not (Test-Path $cfgPath)) { throw "Missing $cfgPath — run railway login" }
  (Get-Content $cfgPath -Raw | ConvertFrom-Json).user.token
}

function Invoke-RailwayGql {
  param([string]$Query, [hashtable]$Variables = @{})
  $token = Get-RailwayToken
  $headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
  $body = @{ query = $Query; variables = $Variables }
  if ($Variables.Count -eq 0) { $body = @{ query = $Query } }
  $r = Invoke-RestMethod -Uri "https://backboard.railway.com/graphql/v2" -Method Post -Headers $headers -Body ($body | ConvertTo-Json -Depth 20 -Compress)
  if ($r.errors) { throw ($r.errors | ConvertTo-Json -Compress) }
  $r.data
}

function Get-RailwayServices {
  $q = @'
query($pid: String!) {
  project(id: $pid) {
    services { edges { node {
      id name
      serviceInstances { edges { node {
        domains {
          customDomains { id domain status { verified certificateStatus dnsRecords { hostlabel recordType requiredValue currentValue status purpose } } }
          serviceDomains { domain }
        }
      } } }
    } } }
  }
}
'@
  (Invoke-RailwayGql -Query $q -Variables @{ pid = $script:RailwayProjectId }).project.services.edges
}

function Get-RailwayServiceByName {
  param([string]$Name)
  $match = Get-RailwayServices | Where-Object { $_.node.name -eq $Name } | Select-Object -First 1
  if (-not $match) { throw "Service not found: $Name" }
  $match.node
}

function Set-RailwayVariable {
  param([string]$ServiceId, [string]$Name, [string]$Value)
  $q = 'mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }'
  Invoke-RailwayGql -Query $q -Variables @{
    input = @{
      projectId = $script:RailwayProjectId
      environmentId = $script:RailwayEnvironmentId
      serviceId = $ServiceId
      name = $Name
      value = $Value
    }
  } | Out-Null
}

function New-RailwayCustomDomain {
  param([string]$ServiceId, [string]$Domain)
  $q = 'mutation($input: CustomDomainCreateInput!) { customDomainCreate(input: $input) { id domain status { verified certificateStatus dnsRecords { hostlabel recordType requiredValue currentValue status purpose } } } }'
  (Invoke-RailwayGql -Query $q -Variables @{
    input = @{
      projectId = $script:RailwayProjectId
      environmentId = $script:RailwayEnvironmentId
      serviceId = $ServiceId
      domain = $Domain
    }
  }).customDomainCreate
}

function Remove-RailwayCustomDomain {
  param([string]$DomainId)
  $q = 'mutation($id: String!) { customDomainDelete(id: $id) }'
  Invoke-RailwayGql -Query $q -Variables @{ id = $DomainId } | Out-Null
}
