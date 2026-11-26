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
$tmp = "/tmp/helm-$ts.dump"
try {
  docker exec $Container pg_dump -U $User -d $Db -Fc -f $tmp
  docker cp "${Container}:$tmp" $file
} finally {
  docker exec $Container rm -f $tmp | Out-Null
}
$hash = (Get-FileHash -Algorithm SHA256 -Path $file).Hash.ToLowerInvariant()
$hashFile = "$file.sha256"
"$hash  $(Split-Path -Leaf $file)" | Set-Content -NoNewline -Path $hashFile -Encoding ascii
Write-Host "Backup written: $file"
Write-Host "SHA256: $hashFile"
Write-Host "Verify: Get-FileHash -Algorithm SHA256 '$file'"
Write-Host "NOTE: Backup includes Postgres dump only. Separately back up browser artifacts/state dirs and securely retain HELM_VAULT_MASTER_KEY/ENCRYPTION_KEY; encrypted vault data cannot be restored without keys."
