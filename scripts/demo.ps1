<#
.SYNOPSIS
  Live demo: reset the event, fire the k6 "ticket drop" at production and watch the
  HorizontalPodAutoscaler react. Open Grafana (http://grafana.localhost) side by side.
.EXAMPLE
  ./scripts/demo.ps1            # 150 virtual fans
  ./scripts/demo.ps1 -Peak 300
#>
param(
  [int]$Peak = 150,
  [string]$HostName = "seatsurge.localhost",
  [string]$Namespace = "seatsurge-prod"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
New-Item -ItemType Directory -Force loadtest/results | Out-Null

Write-Host "Starting HPA watcher in a new window..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-Command", "kubectl get hpa -n $Namespace -w"

Write-Host "Ticket drop! $Peak fans incoming at http://$HostName" -ForegroundColor Magenta
k6 run -e RESET=true -e PEAK=$Peak -e HOST=$HostName loadtest/ticket-drop.js

Write-Host "`nScaling events:" -ForegroundColor Magenta
kubectl get events -n $Namespace --field-selector reason=SuccessfulRescale `
  -o custom-columns=TIME:.lastTimestamp,TARGET:.involvedObject.name,MESSAGE:.message
