# Phase 0 - Foundation

**Status:** `[~]` 91% (dev baseline complete; migration-history/CI-hardening gaps remain)  
**Blueprint refs:** `MASTER-TECHNICAL-BLUEPRINT.md` Phase 0, `13-Repo-Structure-and-Stack.md`

## Goal
Repo, contracts, local dev, CI baseline. `docker compose up` starts core services; CI runs lint/typecheck/build/test; task record can be created/fetched.

## Checklist

### Completed
- [x] Monorepo/workspace scaffolded: pnpm + turbo + TS, `frontend/web`, `backend/api`, `backend/worker`, `backend/browser-worker`, `packages/shared`, `packages/db`, `infra/docker`.
- [x] Shared contracts in `packages/shared` (Zod): task/status/kind/input/control, event envelope, API error, ids/helpers.
- [x] Drizzle schema/client in `packages/db`: users, sessions, tasks, task_events, audit_log, approvals, action_receipts, browser artifacts, connector/vault/P7 tables (P7 baseline applied manually).
- [x] API skeleton: Hono, CORS, request-id, redacted Pino logger, health, task routes, auth skeleton/bootstrap.
- [x] Worker skeleton: DB lease claim CAS, task running/completed events, runtime wiring.
- [x] Browser-worker skeleton/service and web shell present.
- [x] Docker infra: Postgres 16 + Redis 7 healthy (`infra/docker-compose.yml`).
- [x] Dev bootstrap: `backend/api/src/lib/bootstrap.ts`, `packages/db/src/seed.ts`.
- [x] CI workflow: `.github/workflows/ci.yml` (ubuntu-latest, concurrency cancel-in-progress, 20m timeout, Install/Lint/Typecheck/Build/Test, report-only dep audit).
- [x] CI build-order fix landed: `e6f79d4` (Build before Test; shared tests import `./temporal.js`).
- [x] Remote CI evidence: GitHub Actions `45438392752` green; `45441229198` green (2026-11-24).

### Remaining / Blocked
- [ ] **Blocked/tooling:** CI-safe non-interactive Drizzle migration-history alignment for manual P7 baseline (`packages/db/drizzle/0001_p7_tables_manual.sql`). `drizzle-kit push --force` requires TTY; `db:migrate`/CLI path failed in prior attempts; no destructive reset without explicit user approval.
- [ ] Replace ESLint-depth placeholder lint (`tsc --noEmit`) with real ESLint rules where useful.
- [ ] Clean tsconfig dist/src path/workaround debt.
- [ ] Address GitHub Actions Node 20 action deprecation annotations (non-blocking).

## Evidence
- 2026-11-22: `pnpm db:push --force` PASS; `pnpm lint/typecheck/test/build` PASS; smoke create task -> `queued/running/succeeded`, events replayed.
- 2026-11-24: CI run `45438392752` PASS (after `e6f79d4`).
- 2026-11-24: CI run `45441229198` PASS (after `8471aef`).
- Fix refs: `changes/FIX_LOG.md`.
