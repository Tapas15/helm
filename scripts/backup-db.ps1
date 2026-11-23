# Backup Helm Postgres (local docker)
param(
  [string]$OutDir = "backups",
  [string]$Container = "infra-postgres-1",
  [string]$Db = "helm",
  [string]$User = "postgres"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $OutDir "helm-$ts.dump"
docker exec $Container pg_dump -U $User -d $Db -Fc -f /tmp/helm.dump
docker cp "$Container`:/tmp/helm.dump" $file
docker exec $Container rm -f /tmp/helm.dump
Write-Host "Backup written: $file"
