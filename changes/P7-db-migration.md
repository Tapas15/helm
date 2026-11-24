# P7 Manual DB Migration (local Docker workaround)

## Why
`drizzle-kit push --force` fails in this environment with a TTY prompt (`Do you want to truncate sessions table?`), blocking automated schema sync. The P7 tables were previously added in code and manually applied ad hoc.

## Safe, re-runnable migration
- File: `packages/db/drizzle/0001_p7_tables_manual.sql`
- Scope: creates missing P7 tables/indexes/FKs only: `identities`, `identity_policies`, `memory_notes`, `skills`, `proactivity_rules`
- Idempotency: `CREATE TABLE/INDEX IF NOT EXISTS`; FK constraints guarded by `pg_constraint` checks.

## Apply (local Docker Postgres)
```powershell
Get-Content packages/db/drizzle/0001_p7_tables_manual.sql -Raw | docker exec -i infra-postgres-1 psql -U postgres -d helm -v ON_ERROR_STOP=1 -f -
```

## Verification
- `pnpm --filter @helm/db db:generate` generated baseline `0000_motionless_smasher.sql` (no schema drift from code).
- Manual migration applied to local Docker DB: created 5 tables, 7 FKs, 8 indexes.
- `pg_tables` now includes all P7 tables.

## Remaining DB migration debt
- Establish a non-interactive, CI-safe Drizzle migration workflow (baseline journal alignment or fresh migration history) so `db:push`/`db:migrate` is deterministic without manual SQL.
