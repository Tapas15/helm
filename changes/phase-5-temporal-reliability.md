# Phase 5 - Temporal Reliability Layer

**Status:** `[~]` 68%  
**Blueprint refs:** Phase 5, `08-Temporal-Reliable-Execution.md`, `changes/ADR-002-temporal-scope.md`

## Goal
Durable execution for real tasks: Temporal workflows/signals/queries, idempotent activities, schedules, uncertain-write reconciliation. No blind retry of uncertain external writes.

## What we have done
- **ADR/scaffold**: ADR-002 drafted (incremental migration; Temporal for high-risk/long-running/external-write workflows first; DB lease worker fallback). Temporal dev infra docker-compose profile; `packages/shared/src/temporal.ts` contracts/config; `@helm/temporal-worker` scaffold.
- **Temporal routing/fail-closed**: API routes gmail/calendar/browser external writes behind `HELM_TEMPORAL_ENABLED`; fail-closed 503 on routing failure; internal bypass headers prevent re-entry loops. Stub/real/mock rollback proofs: `temporal-routing-api` PASS (1/1), `temporal-e2e` PASS (1/1), `temporal-side-effect-e2e` PASS (1/1), `temporal-rollback-e2e` PASS (1/1).
- **Guarded activities**: `gmail.send`/`calendar.create_event` route through guarded API paths with approval/actionHash/idempotency; 5xx/429/503 mapped to uncertain; non-retryable policy classes.
- **DB-canonical reconciliation**: `reconcileUncertainReceipts` lookup-first, no blind retry; Gmail/Calendar lookup; proven marks executed + evidence/audit/task event `receipt.reconciled`. API `GET /v1/reconciliation/status`, `POST /run`, `POST /dry-run`; user-scoped default; `scope=all` guarded by `HELM_ALLOW_DEV_AUTH=1`; optional in-process scheduler.
- **Temporal reconciliation hardening**: `helmReconciliationWorkflow`, `reconcileUncertainReceiptsActivity`, worker schedule bootstrap; `HELM_TEMPORAL_RECONCILIATION_SCHEDULE_*` config/status/dev-gated `POST /v1/reconciliation/schedule/ensure`; `HELM_RECONCILIATION_FAULT_INJECT` guards preserve no-blind-retry. Env-gated `reconciliation-api` PASS (10/10). CI green `45441229198` (`8471aef`).

## Checklist

### Completed
- [x] P5-A: ADR-002 drafted (incremental migration; Temporal for high-risk/long-running/external-write workflows first; DB lease worker fallback behind feature flag).
- [x] P5-A: Temporal dev infra scaffold in docker-compose (profile-gated; not default startup).
- [x] P5-B: Shared Temporal config/contracts in `packages/shared/src/temporal.ts`; `@helm/temporal-worker` scaffold (client bootstrap, workflow signal/query skeleton).
- [x] P5-C: Guarded Temporal activities for `gmail.send`/`calendar.create_event` route through existing guarded API paths with approval/actionHash/idempotency; 5xx/429/503 mapped to uncertain; workflow retry policy with non-retryable classes.
- [x] P5-D: API Temporal routing behind `HELM_TEMPORAL_ENABLED` for gmail/calendar/browser external writes; fail-closed 503 on routing failure; internal bypass headers prevent re-entry loops.
- [x] P5-D: Stub test mode + env-gated routing integration (`temporal-routing-api` PASS 1/1).
- [x] P5-D: Real Temporal server E2E dedupe/idempotency proof (`temporal-e2e` PASS 1/1).
- [x] P5-D: Mock-provider side-effect E2E worker restart/idempotent receipt and uncertain reconciliation (`temporal-side-effect-e2e` PASS 1/1).
- [x] P5-D: Rollback E2E proof (`temporal-rollback-e2e` PASS 1/1).
- [x] P5-D: DB-canonical reconciliation service `reconcileUncertainReceipts` (lookup-first, no blind retry); Gmail/Calendar lookup; proven marks executed + evidence/audit/task event `receipt.reconciled`.
- [x] P5-D: Reconciliation API `GET /v1/reconciliation/status|POST /run|POST /dry-run`; default user-scoped; `scope=all` guarded by `HELM_ALLOW_DEV_AUTH=1`; optional in-process scheduler (`HELM_RECONCILIATION_*`).
- [x] P5-D: Env-gated reconciliation API integration PASS (10/10) including scheduler tick, calendar update/delete uncertain reconciliation, delete-still-present no-blind-retry guard, dry-run no-mutation case.
- [x] P5-D: Temporal reconciliation workflow/activity/schedule bootstrap (`helmReconciliationWorkflow`, `reconcileUncertainReceiptsActivity`, `HELM_TEMPORAL_RECONCILIATION_SCHEDULE_*`), schedule status/dev-gated ensure endpoint, fault-injection guards (`HELM_RECONCILIATION_FAULT_INJECT`) preserving no-blind-retry (`8471aef`, CI `45441229198` green).

### Remaining / Blocked
- [ ] **Blocked:** Real-provider no-duplicate proof (needs Google creds/sandbox).
- [ ] Real Temporal server schedule/monitor/fault-injection E2E depth (env-gated scaffold exists: `tests/integration/src/temporal-reconciliation-e2e.test.ts`).
- [ ] P5-E: Retry policies by action class integration proof; non-retryable `PolicyDenied/ValidationError/ApprovalRejected/UncertainExternalOutcome`.
- [ ] P5-F: Schedules/monitors, dead-letter/operator runbooks, observability depth.
- [ ] Verify Temporal routing coverage for all required external-write paths in production config.
- [ ] Disable-flag rollback proof in live/staging-like config.
- [ ] Keep DB worker as default/fallback until Temporal path fully verified.

## Evidence
- P5-B/C/D: `pnpm --filter @helm/shared typecheck` PASS; `pnpm --filter @helm/temporal-worker typecheck` PASS; `pnpm --filter @helm/api typecheck` PASS.
- Env-gated: `temporal-routing-api` PASS (1/1), `temporal-e2e` PASS (1/1), `temporal-side-effect-e2e` PASS (1/1), `temporal-rollback-e2e` PASS (1/1), `reconciliation-api` PASS (10/10).
- 2026-11-24: `8471aef`, CI `45441229198` green.
- 2026-11-24: `HELM_TEMPORAL_RECONCILIATION_E2E_TEST=1 pnpm -C tests/integration exec vitest run src/temporal-reconciliation-e2e.test.ts` PASS (1/1, 39.9s) — Temporal reconciliation schedule tick reconciled uncertain receipt; lookup fault injection preserved no-blind-retry.
