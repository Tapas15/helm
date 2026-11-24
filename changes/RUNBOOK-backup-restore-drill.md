# Runbook: Backup/Restore Drill (local, no external deps)

## Preconditions
- Docker `infra-postgres-1` running.
- Stop API/worker/browser-worker to avoid writes during restore.

## Drill
1. Backup: `pwsh -File scripts/backup-db.ps1 -OutDir backups`
2. Record counts: `docker exec infra-postgres-1 psql -U postgres -d helm -c "select count(*) from tasks; select count(*) from action_receipts;"`
3. Restore to scratch DB (safe): create `helm_restore_test`, restore dump, verify counts match.
4. Cleanup scratch DB.

## Evidence to capture
- dump filename + sha256
- pre/post counts
- restore command output
- operator/date

## Status
- Scripts exist; drill execution not yet recorded in this environment.
