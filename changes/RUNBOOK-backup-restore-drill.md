# Runbook: Backup/Restore Drill (safe, local)

## Purpose
Record an operator-executed drill without overwriting `helm` DB. Use a scratch restore DB and capture evidence.

## Preconditions
- Docker Postgres container running (default `infra-postgres-1`).
- Stop API/worker/browser-worker to avoid writes during backup capture.
- Have secure access to env key material location (do not copy secrets into repo).

## Drill Steps
1. **Backup**
   ```powershell
   pwsh -File scripts/backup-db.ps1 -OutDir backups -Container infra-postgres-1 -Db helm -User postgres
   ```
2. **Capture pre-drill counts** (source DB)
   ```powershell
   docker exec infra-postgres-1 psql -U postgres -d helm -c "select 'tasks',count(*) from tasks union all select 'task_events',count(*) from task_events union all select 'action_receipts',count(*) from action_receipts union all select 'browser_artifacts',count(*) from browser_artifacts;"
   ```
3. **Restore to scratch DB (safe)**
   ```powershell
   docker exec infra-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS helm_restore_test;"
   docker exec infra-postgres-1 psql -U postgres -c "CREATE DATABASE helm_restore_test;"
   pwsh -File scripts/restore-db.ps1 -DumpFile backups/helm-YYYYMMDD-HHMMSS.dump -Container infra-postgres-1 -Db helm_restore_test -User postgres -Force
   ```
4. **Verify restored counts/schema**
   ```powershell
   docker exec infra-postgres-1 psql -U postgres -d helm_restore_test -c "select 'tasks',count(*) from tasks union all select 'task_events',count(*) from task_events union all select 'action_receipts',count(*) from action_receipts union all select 'browser_artifacts',count(*) from browser_artifacts;"
   docker exec infra-postgres-1 psql -U postgres -d helm_restore_test -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
   ```
5. **Artifact/key scope check (manual)**
   - Confirm artifact/state dir backup location exists and access-controlled.
   - Confirm vault master key/env key material is retrievable from secure store (record reference, not value).
6. **Cleanup**
   ```powershell
   docker exec infra-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS helm_restore_test;"
   ```

## Evidence to Capture (append to P8 evidence doc)
- Operator/date/environment
- Dump filename + SHA256
- Pre/post counts
- Restore command output/exit code
- Artifact/key scope verification result (no secrets)
- Gaps/follow-ups

## Status
- Scripts hardened with checksum/force guard. Full operator drill including artifacts/vault-key scope remains pending manual execution.
