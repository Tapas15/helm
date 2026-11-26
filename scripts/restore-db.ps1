# Restore Helm Postgres (local docker) - destructive to target DB objects
param(
  [Parameter(Mandatory=$true)][string]$DumpFile,
  [string]$Container = "infra-postgres-1",
  [string]$Db = "helm",
  [string]$User = "postgres",
  [string]$ChecksumFile = "",
  [switch]$SkipChecksum,
  [switch]$Force
)
$ErrorActionPreference = "Stop"
if (!(Test-Path $DumpFile)) { throw "Dump file not found: $DumpFile" }
if (-not $SkipChecksum) {
  $sum = if ($ChecksumFile) { $ChecksumFile } elseif (Test-Path "$DumpFile.sha256") { "$DumpFile.sha256" } else { "" }
  if ($sum) {
    $expected = ((Get-Content -Path $sum -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash -Algorithm SHA256 -Path $DumpFile).Hash.ToLowerInvariant()
    if ($expected -ne $actual) { throw "Checksum mismatch. Expected $expected, got $actual ($DumpFile)" }
    Write-Host "Checksum verified: $sum"
  } else {
    Write-Warning "No checksum file found; pass -SkipChecksum to proceed without checksum verification."
  }
}
if (-not $Force) {
  throw "Refusing destructive restore without -Force. Target DB: $Db on container $Container. Re-run with -Force after stopping API/worker/browser-worker and confirming backup."
}
$tmp = "/tmp/helm.restore.$([Guid]::NewGuid().ToString('N')).dump"
try {
  docker cp $DumpFile "${Container}:$tmp"
  docker exec $Container pg_restore -U $User -d $Db --clean --if-exists $tmp
} finally {
  docker exec $Container rm -f $tmp | Out-Null
}
Write-Host "Restore completed from: $DumpFile"
Write-Host "NOTE: Restore does not restore browser artifacts/state dirs or vault master keys. Restore BROWSER_ARTIFACT_DIR/BROWSER_STATE_DIR and HELM_VAULT_MASTER_KEY/ENCRYPTION_KEY before starting services."
