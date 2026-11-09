<#
.SYNOPSIS
  Tear everything down: destroys the kind cluster and all platform components.
.NOTES
  The prod SealedSecret is encrypted for this cluster's key. After a fresh `up`,
  re-seal it with ./scripts/seal-secret.ps1 (or restore a backed-up sealing key).
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
terraform -chdir="$root/infra/terraform/local" destroy -auto-approve -input=false
docker compose -f "$root/docker-compose.yml" down
