# Restore Helm Postgres (local docker) - destructive to target DB objects
param(
  [Parameter(Mandatory=$true)][string]$DumpFile,
  [string]$Container = "infra-postgres-1",
  [string]$Db = "helm",
  [string]$User = "postgres"
)
$ErrorActionPreference = "Stop"
if (!(Test-Path $DumpFile)) { throw "Dump file not found: $DumpFile" }
docker cp $DumpFile "$Container`:/tmp/helm.restore.dump"
docker exec $Container pg_restore -U $User -d $Db --clean --if-exists /tmp/helm.restore.dump
docker exec $Container rm -f /tmp/helm.restore.dump
Write-Host "Restore completed from: $DumpFile"
