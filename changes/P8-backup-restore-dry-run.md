# P8 Backup/Restore Drill (dry-run, local Docker)

**Date:** 2026-11-24  
**Mode:** Non-destructive dry-run. Backup created from `infra-postgres-1`; restore tested into temporary DB `helm_restore_test`; temp DB dropped. Production/dev DB `helm` not overwritten.

## Commands
```powershell
./scripts/backup-db.ps1 -OutDir backups -Container infra-postgres-1 -Db helm -User postgres
docker exec infra-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS helm_restore_test;"
docker exec infra-postgres-1 psql -U postgres -c "CREATE DATABASE helm_restore_test;"
docker cp backups/helm-20261124-161337.dump infra-postgres-1:/tmp/helm.restore.dump
docker exec infra-postgres-1 pg_restore -U postgres -d helm_restore_test --clean --if-exists /tmp/helm.restore.dump
docker exec infra-postgres-1 psql -U postgres -d helm_restore_test -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
docker exec infra-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS helm_restore_test;"
docker exec infra-postgres-1 rm -f /tmp/helm.restore.dump
```

## Evidence (2026-11-24)
- Backup file: `backups/helm-20261124-161337.dump` (created locally by dry-run).
- Restore target: `helm_restore_test` (temporary). `pg_restore` completed with exit 0.
- Table count in restored DB: 17 public tables, including P7 tables (`identities`, `identity_policies`, `memory_notes`, `skills`, `proactivity_rules`).
- Temp DB dropped after verification.

## Gaps (still manual/approval-needed)
- Full drill including artifact directory + vault key/secret material handling and restore validation in a staging-like environment.
- Encrypted backup storage, retention policy, and access controls.
- Automated scheduled backup + restore verification job.
