# Operator scripts

Local tooling for provisioning store infrastructure. Not part of the runtime servers.

| Script | Purpose |
|--------|---------|
| `railway-tool.js` | Railway management CLI — deployment status, build/runtime logs, single-service redeploy, sequential healing |
| `godaddy-dns.ps1` | GoDaddy REST API — list/set/delete DNS records |
| `railway-api.ps1` | Railway GraphQL helpers (dot-source) |
| `connect-store-dns.ps1` | One-shot: Railway custom domain + GoDaddy CNAME + `STORE_DOMAIN` |

## Railway Tool Commands

```powershell
node operator/railway-tool.js status                       # Show live commit & build status for all 16 services
node operator/railway-tool.js logs "UK Campaign" 50       # Fetch recent build and runtime logs for a service
node operator/railway-tool.js redeploy "UK Campaign"      # Trigger a clean redeploy for a service
node operator/railway-tool.js heal                        # Sequentially redeploy all failed services without queue congestion
```

## Prerequisites

- `secrets/godaddy.env` — GoDaddy API key/secret (gitignored)
- `~/.railway/config.json` — Railway CLI login token

## GoDaddy store DNS (canonical pattern)

All live stores use **`www.<apex>`** as the canonical host (Supabase `stores.domain`, Railway `STORE_DOMAIN`, Stripe dashboard URL). GoDaddy cannot CNAME the apex — wire `www` only.

```powershell
.\operator\connect-store-dns.ps1 `
  -ServiceName "Larkwell Home Shop" `
  -ApexDomain larkwellhome.online `
  -StoreSlug larkwell-home
```

If `https://www.<domain>/` returns Railway `404 Application not found` despite correct CNAME, the custom-domain binding is stale — delete and recreate on Railway (the script's underlying API requires `environmentId` in `customDomainCreate`; see LESSONS.md).

Manual DNS inspection:

```powershell
.\operator\godaddy-dns.ps1 get-records -Domain larkwellhome.online
.\operator\godaddy-dns.ps1 set-cname -Domain larkwellhome.online -RecordName www -Target 8lkrz2r6.up.railway.app
```

Reference live stores: `www.optimisystems.store`, `www.preciouscouture.online`, `www.digitelon.shop`, `www.alzworks.shop`, `www.larkwellhome.online`.
