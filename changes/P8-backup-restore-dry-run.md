# P8 Backup/Restore Dry Run

**Date:** 2026-11-24 (evidence), 2026-11-26 (checklist refresh)  
**Mode:** Non-destructive dry-run. Backup created from `infra-postgres-1`; restore tested into temporary DB `helm_restore_test`; temp DB dropped. Production/dev DB `helm` was not overwritten.

## Safe Dry-Run Checklist (operator)

Preconditions:
- [ ] Confirm target is scratch DB/container, never production DB without explicit approved maintenance window.
- [ ] Stop API/worker/browser-worker writers or confirm isolated scratch restore target.
- [ ] Ensure disk space for dump + checksum.
- [ ] Confirm vault keys available separately (`HELM_VAULT_MASTER_KEY`/`ENCRYPTION_KEY`); dump does not include them.

Backup:
- [ ] Run `./scripts/backup-db.ps1 -OutDir backups -Container infra-postgres-1 -Db helm -User postgres`
- [ ] Verify checksum file exists (`.sha256`) and `Get-FileHash -Algorithm SHA256 <dump>` matches.
- [ ] Record dump name, size, SHA256, timestamp, operator.

Restore to scratch DB only:
- [ ] `docker exec infra-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS helm_restore_test;"`
- [ ] `docker exec infra-postgres-1 psql -U postgres -c "CREATE DATABASE helm_restore_test;"`
- [ ] `pwsh -File scripts/restore-db.ps1 -DumpFile <dump> -Container infra-postgres-1 -Db helm_restore_test -User postgres -Force`
- [ ] Verify table count / critical tables / recent rows as appropriate.
- [ ] `docker exec infra-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS helm_restore_test;"`

Evidence to capture:
- [ ] Command log, exit codes, dump SHA256, restored object counts, temp DB cleanup confirmation.
- [ ] Scope statement: DB only; artifacts/state dirs and vault keys not included.

## Commands
```powershell
./scripts/backup-db.ps1 -OutDir backups -Container infra-postgres-1 -Db helm -User postgres
docker exec infra-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS helm_restore_test;"
docker exec infra-postgres-1 psql -U postgres -c "CREATE DATABASE helm_restore_test;"
# restore into scratch DB (requires -Force after script hardening)
pwsh -File scripts/restore-db.ps1 -DumpFile backups/helm-20261124-161337.dump -Container infra-postgres-1 -Db helm_restore_test -User postgres -Force
docker exec infra-postgres-1 psql -U postgres -d helm_restore_test -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
docker exec infra-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS helm_restore_test;"
```

## Evidence (2026-11-24)
- Backup file: `backups/helm-20261124-161337.dump` (local dry-run artifact, gitignored/untracked).
- Checksum: script now emits `.sha256`; existing dry-run artifact predates checksum sidecar.
- Restore target: `helm_restore_test` (temporary). `pg_restore` exit 0.
- Restored public table count: 17, including P7 tables (`identities`, `identity_policies`, `memory_notes`, `skills`, `proactivity_rules`).
- Temp DB dropped after verification.

## 2026-11-26 Script Hardening (no new restore drill executed)
- `scripts/backup-db.ps1` now writes `<dump>.sha256` and prints scope warning (DB dump only; artifacts/vault keys separate).
- `scripts/restore-db.ps1` now verifies checksum by default, requires explicit `-Force`, and prints scope warning.
- No destructive restore executed in this session.

## Gaps (manual/approval-needed)
- Full drill including artifact directory + vault key/secret material handling and restore validation in staging-like environment.
- Encrypted backup storage, retention policy, and access controls.
- Automated scheduled backup + restore verification job.