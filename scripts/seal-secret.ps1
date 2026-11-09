<#
.SYNOPSIS
  Generate a new random Postgres password for an environment, encrypt it with the
  cluster's Sealed Secrets public key, and write the ciphertext into values-<env>.yaml.
  The plaintext never touches disk or git.
.EXAMPLE
  ./scripts/seal-secret.ps1 -Environment prod
#>
param([ValidateSet("staging", "prod")][string]$Environment = "prod")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$valuesFile = Join-Path $root "deploy/helm/seatsurge/values-$Environment.yaml"

$bytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = -join ($bytes | ForEach-Object { "{0:x2}" -f $_ })

$sealed = $password | kubeseal --raw --namespace "seatsurge-$Environment" --name seatsurge-postgres `
  --controller-name sealed-secrets-controller --controller-namespace kube-system
if ($LASTEXITCODE -or -not $sealed) { throw "kubeseal failed" }

$content = Get-Content $valuesFile -Raw
$content = $content -replace "encryptedPostgresPassword: \S+", "encryptedPostgresPassword: $sealed"
Set-Content -Path $valuesFile -Value $content -NoNewline -Encoding utf8
Write-Host "Updated $valuesFile with a freshly sealed password. Commit it; it is safe."
