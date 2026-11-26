# P8 Backup/Restore Runbook

## Scope
- **Included by scripts:** Postgres dump (`pg_dump -Fc`) for Helm DB.
- **Not included by scripts:** browser artifact/state directories, object store contents, vault master key/env, Temporal dev state, Docker volumes outside Postgres dump. These must be handled explicitly.

## Safety Preconditions
- Do not restore over a live DB without explicit operator intent. Stop API/worker/browser-worker first.
- `scripts/restore-db.ps1` is destructive (`pg_restore --clean --if-exists`) and requires `-Force`.
- Verify dump checksum before restore when available.
- Never store real secrets in repo; retain `HELM_VAULT_MASTER_KEY`/`ENCRYPTION_KEY` securely.

## Backup
```powershell
pwsh -File scripts/backup-db.ps1 -OutDir backups -Container infra-postgres-1 -Db helm -User postgres
```
Outputs:
- `backups/helm-<timestamp>.dump`
- `backups/helm-<timestamp>.dump.sha256`

Also back up (separately, secure storage):
- Browser artifacts/state dirs (`BROWSER_ARTIFACT_DIR`, `BROWSER_STATE_DIR` / worker artifact config).
- Vault key material: `HELM_VAULT_MASTER_KEY`, `ENCRYPTION_KEY`, `SESSION_SECRET`, connector secrets as applicable. **Encrypted vault rows cannot be restored without keys.**
- `.env`/deployment secret store references (not values in git).

## Restore (destructive, requires -Force)
```powershell
# Stop services first (API/worker/browser-worker)
pwsh -File scripts/restore-db.ps1 -DumpFile backups/helm-YYYYMMDD-HHMMSS.dump -Container infra-postgres-1 -Db helm -User postgres -Force
```
Optional:
- `-ChecksumFile backups/helm-....dump.sha256`
- `-SkipChecksum` only when checksum is unavailable and operator accepts risk.

After DB restore:
1. Restore artifact/state dirs to configured paths.
2. Restore env/secret keys in secure env store.
3. Start services.
4. Verify: `/health`, task list, task export, receipts/artifacts resolve, connector status metadata (no secret plaintext).

## Dry-Run / Drill Evidence
- Non-destructive dry-run evidence: `changes/P8-backup-restore-dry-run.md`.
- Drill runbook template: `changes/RUNBOOK-backup-restore-drill.md`.

## Known Gaps (P8 remaining)
- [ ] Full drill including artifact dir + vault key scope in staging-like env (ops/manual evidence).
- [ ] Encrypted backup storage, retention policy, access controls.
- [ ] Scheduled backup + restore verification automation.
- [ ] Object-store/artifact backup when artifact storage moves beyond local dir.
