# Phase 0 - Foundation

**Status:** `[x]` Functionally complete for dev (2026-11-22). Remote CI evidence / deeper hardening remain tracked.  
**Blueprint refs:** `MASTER-TECHNICAL-BLUEPRINT.md` Phase 0 (Week 1-2), `13-Repo-Structure-and-Stack.md`

## Goal
Repo, contracts, local dev, CI baseline. `docker compose up` starts core services; CI runs lint/typecheck/unit tests; can create and fetch a task record.

## Completed

- [x] Created `helm/` monorepo root.
- [x] Added workspace/tooling files: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.editorconfig`, `.prettierrc`, `.env.example`, `.env`.
- [x] Created package/app structure: `frontend/web`, `backend/api`, `backend/worker`, `backend/browser-worker`, `packages/shared`, `packages/db`, `infra/docker`.
- [x] `packages/shared`: Zod contracts for task status/kind/input/task, control action, event envelope, API error, `uid()` helper.
- [x] `packages/db`: Drizzle schema for `users`, `sessions`, `tasks`, `task_events`, `audit_log`; indexes/unique `(task_id, sequence)`; DB client factory; `drizzle.config.ts`.
- [x] `backend/api`: Hono server, CORS, request-id, redacted Pino logger, health endpoint, local auth skeleton (`x-user-id` fallback dev user), task routes create/list/get/events/control, audit/event writes.
- [x] `backend/worker`: poll loop, DB lease claim with compare-and-swap style guard, emits `task.running`/`task.completed`, placeholder execution marks task succeeded.
- [x] `backend/browser-worker`: token-protected skeleton service, `/health`, Phase 3 stub `501`.
- [x] `frontend/web`: Vite+React+TanStack Query shell, task create/list/detail, control buttons, event timeline polling every 2s.
- [x] `infra/docker-compose.yml`: Postgres 16, Redis 7, MinIO.
- [x] `README.md` with quickstart and invariants.

## Exit Criteria Status (2026-11-22)

- [x] Install deps: `pnpm install`.
- [x] Start infra: Docker Postgres 16/Redis 7 healthy (`infra/docker-compose.yml`; MinIO removed for now).
- [x] Apply schema: `pnpm db:push --force`.
- [x] Run `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm lint` (all PASS).
- [x] Smoke test: create task via API, worker transition `queued -> running -> succeeded`, events replayed.
- [x] CI workflow exists: `.github/workflows/ci.yml` (remote run evidence still pending).
- [x] Dev user bootstrap: `backend/api/src/lib/bootstrap.ts` + `packages/db/src/seed.ts`.
- [x] Phase 0 compile/runtime blockers fixed (see `changes/FIX_LOG.md`).

## Still Open / Ongoing Hardening

- [ ] GitHub Actions remote run evidence.
- [ ] Replace ESLint-depth placeholder lint (`tsc --noEmit`) with real ESLint rules.
- [ ] DB-backed/fault-injection/stress/concurrency/heartbeat-recovery coverage beyond current integration slice.
- [ ] Cross-cutting: `HelmError` fully wired across all paths, agent trace/fix-audit events, debug bundle/fault flags.

## Known Gaps / Risks

- Auth is dev-only header fallback; no real session/OIDC.
- No WebSocket event stream; UI uses polling.
- No policy/Sentinel gate; task control has minimal transition guard.
- No idempotency keys/receipts for external actions.
- No Temporal; worker is simple DB lease loop.
- Browser worker is stub only.
- `.env` committed in workspace locally; ensure secrets never real/committed.

## Verification Evidence

- 2026-11-22: scaffold created; deps installed; Docker Postgres/Redis healthy.
- 2026-11-22: `pnpm db:push --force` PASS.
- 2026-11-22: `pnpm lint` PASS (8/8), `pnpm typecheck` PASS (8/8), `pnpm test` PASS (11/11, incl. integration 4/4), `pnpm build` PASS (7/7).
- 2026-11-22: smoke PASS - `POST /v1/tasks` created task, worker moved `queued -> running -> succeeded`, events replayed `task.created -> task.running -> task.completed`.
- 2026-11-22: CI workflow file added; remote GitHub Actions run evidence pending.
- 2026-11-22: fix evidence recorded in `changes/FIX_LOG.md` (typecheck blockers, PostCSS build, dev-user bootstrap).


