<#
.SYNOPSIS
  One command to bring up the whole SeatSurge platform locally.
.DESCRIPTION
  1. terraform apply  -> kind cluster + Traefik + Prometheus/Grafana/Alertmanager + Loki/Alloy + Sealed Secrets
  2. docker build     -> the three service images (multi-stage, tests run inside the build)
  3. kind load        -> images into the cluster nodes
  4. helm upgrade     -> staging and prod releases, then `helm test`
.EXAMPLE
  ./scripts/up.ps1
  ./scripts/up.ps1 -Version 1.1.0 -SkipInfra
#>
param(
  [string]$Version = "1.0.0",
  [switch]$SkipInfra
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Magenta }

if (-not $SkipInfra) {
  Step "Provisioning cluster and platform with Terraform"
  terraform -chdir=infra/terraform/local init -input=false | Out-Null
  terraform -chdir=infra/terraform/local apply -auto-approve -input=false
}

Step "Building images ($Version)"
foreach ($svc in "web", "inventory", "checkout") {
  docker build --build-arg APP_VERSION=$Version -t "seatsurge-${svc}:$Version" "services/$svc"
  if ($LASTEXITCODE) { throw "docker build failed for $svc" }
}

Step "Loading images into kind"
kind load docker-image "seatsurge-web:$Version" "seatsurge-inventory:$Version" "seatsurge-checkout:$Version" --name seatsurge

foreach ($envName in "staging", "prod") {
  Step "Deploying to $envName"
  helm upgrade --install seatsurge deploy/helm/seatsurge -n "seatsurge-$envName" `
    -f "deploy/helm/seatsurge/values-$envName.yaml" --set global.imageTag=$Version --atomic --wait --timeout 6m
  if ($LASTEXITCODE) { throw "helm upgrade failed for $envName" }
  helm test seatsurge -n "seatsurge-$envName"
}

Step "Done"
Write-Host "  App (prod):    http://seatsurge.localhost"
Write-Host "  App (staging): http://staging.seatsurge.localhost"
Write-Host "  Grafana:       http://grafana.localhost   (user admin, password: terraform -chdir=infra/terraform/local output -raw grafana_admin_password)"
Write-Host "  Prometheus:    http://prometheus.localhost"
Write-Host "  Alertmanager:  http://alertmanager.localhost"
