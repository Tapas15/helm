# Phase 0 - Foundation

**Status:** `[x]` 100% (foundation gate satisfied; non-blocking debt recorded)  
**Blueprint refs:** `MASTER-TECHNICAL-BLUEPRINT.md` Phase 0, `13-Repo-Structure-and-Stack.md`

## Goal
Repo, contracts, local dev, CI baseline. `docker compose up` starts core services; CI runs lint/typecheck/build/test; task record can be created/fetched.

## Checklist

### Completed
- [x] Monorepo/workspace scaffolded: pnpm + turbo + TS, `frontend/web`, `backend/api`, `backend/worker`, `backend/browser-worker`, `backend/temporal-worker`, `packages/shared`, `packages/db`, `infra/docker`.
- [x] Shared contracts in `packages/shared` (Zod): task/status/kind/input/control, event envelope, API error, ids/helpers.
- [x] Drizzle schema/client in `packages/db`: users, sessions, tasks, task_events, audit_log, approvals, action_receipts, browser artifacts, connector/vault/P7 tables.
- [x] API skeleton: Hono, CORS, request-id, redacted Pino logger, health, task routes, auth skeleton/bootstrap.
- [x] Worker skeleton: DB lease claim CAS, task running/completed events, runtime wiring.
- [x] Browser-worker skeleton/service and web shell present.
- [x] Docker infra: Postgres 16 + Redis 7 healthy (`infra/docker-compose.yml`).
- [x] Dev bootstrap: `backend/api/src/lib/bootstrap.ts`, `packages/db/src/seed.ts`.
- [x] CI workflow: `.github/workflows/ci.yml` (ubuntu-latest, concurrency cancel-in-progress, 20m timeout, Install/Lint/Typecheck/Build/Test, report-only dep audit).
- [x] CI build-order fix landed: `e6f79d4` (Build before Test; shared tests import `./temporal.js`).
- [x] Remote CI evidence: GitHub Actions `45438392752` green; `45441229198` green (2026-11-24).
- [x] Drizzle alignment script cwd-independent and idempotent from repo root/`packages/db`.
- [x] Backend tsconfig `dist/src` include workaround removed (api/worker/browser-worker include `src` only) with lint/typecheck/build/test PASS (2026-11-25).
- [x] `backend/temporal-worker/tsconfig.json` workaround removed (`include:["src"]`); root `tsconfig.json` includes `backend/temporal-worker` reference (2026-11-26).
- [x] Tracked generated package src JS/d.ts/map artifacts removed from `packages/db`, `packages/shared`, `packages/observability`; `.gitignore` guards `packages/*/src/**/*.{js,js.map,d.ts,d.ts.map}` (2026-11-26).
- [x] CI fresh-DB migrate smoke: Postgres 16 service + `DATABASE_URL` + `pnpm --filter @helm/db db:migrate` before tests (2026-11-26).
- [x] Remote CI/fresh-clone gate green with DB migrate smoke: [45812802322](https://github.com/Tapas15/helm/actions/runs/45812802322) (`f06c50a`, 2026-11-26) PASS including DB migrate smoke.
- [x] ESLint is real (not placeholder): `eslint.config.mjs` + `eslint` lint scripts across packages.

### Accepted non-blocking debt (not P0 gate blockers)
- [ ] GitHub Actions Node 20 action deprecation annotations; action-major bumps require compatibility verification before changing workflow pins.
- [ ] Optional ESLint rule tightening (quality hardening).
- [ ] Legacy/idempotent `0001_p7_tables_manual.sql` remains outside drizzle journal by design (`0000` contains P7 tables); no destructive reset without explicit user approval.

## Evidence
- 2026-11-22: `pnpm db:push --force` PASS; `pnpm lint/typecheck/test/build` PASS; smoke create task -> `queued/running/succeeded`, events replayed.
- 2026-11-24: CI run `45438392752` PASS (after `e6f79d4`).
- 2026-11-24: CI run `45441229198` PASS (after `8471aef`).
- 2026-11-25: tsconfig dist/src cleanup (api/worker/browser-worker); lint/typecheck/build/test PASS.
- 2026-11-26: temporal-worker tsconfig/root ref cleanup; generated package src artifacts untracked+gitignored; CI Postgres+migrate smoke added. Local: lint PASS (warnings only), typecheck PASS (9/9), build PASS (8/8). Full test: browser-worker correlation-echo timed out once at 5s, rerun with 15s PASS 3/3; remaining suites green with expected env-gated skips. No destructive DB reset.
- 2026-11-26: Remote CI [45812802322](https://github.com/Tapas15/helm/actions/runs/45812802322) (`f06c50a`) PASS including DB migrate smoke (fresh Postgres), lint, typecheck, build, test, dependency audit report.
- Fix refs: `changes/FIX_LOG.md`.
