# Phase 5 - Temporal Reliability Layer

**Status:** `[~]` P5-A planning/infra scaffold started (2026-11-23)  
**Blueprint refs:** Phase 5, `08-Temporal-Reliable-Execution.md`, `changes/ADR-002-temporal-scope.md`

## Goal
Durable execution for real tasks: Temporal workflows, signals/queries, idempotent activities, schedules, uncertain-write reconciliation. No blind retry of uncertain external writes.

## Completed
- [x] P5-A: ADR-002 drafted (incremental migration; Temporal for high-risk/long-running/external-write workflows first; DB lease worker remains fallback behind feature flag).
- [x] P5-A: Temporal dev infra scaffold added to docker-compose (profile-gated; not default startup path).
- [x] P5-B: `packages/shared/src/temporal.ts` config/feature flags; `@helm/temporal-worker` scaffold (client bootstrap, workflow signal/query skeleton, activity scaffold); shared/temporal-worker typecheck PASS (`be4f0a9`).
- [x] P5-C: Guarded Temporal activities for `gmail.send`/`calendar.create_event` route through existing guarded API paths with approval/actionHash/idempotency; 5xx/429/503 mapped to uncertain; workflow retry policy with non-retryable classes (`38840e7`).
- [~] P5-D: API Temporal client routing added behind `HELM_TEMPORAL_ENABLED=external-write` for `gmail.send` and `calendar.create_event` (`f55eb8a`). Returns 202 + workflowId/runId when routed; fail-closed 503 on Temporal routing failure. DB/direct guarded path remains default fallback.

## Remaining
- [ ] P5-D: Wire runtime/API approval signals to Temporal workflows after approval decision (currently route starts workflow and signals approve immediately post-validation); add env-gated integration proof for worker-kill/restart no-duplicate-side-effect, signal resume, uncertain reconciliation.
- [ ] P5-C/D scope: add `browser.external_action` Temporal activity/routing; reconciliation workflow for uncertain receipts.
- [ ] P5-E: Retry policies by action class; non-retryable `PolicyDenied/ValidationError/ApprovalRejected/UncertainExternalOutcome` (scaffolded in workflow, needs integration proof).
- [ ] P5-F: Schedules/monitors; dead-letter/operator runbooks; observability.
- [ ] Worker kill/restart mid-task: no duplicate side effect (integration proof).
- [ ] Disable flag rollback proof.

## Verification Evidence
- P5-A: docs/docker-compose scaffold only; no runtime verification yet (Temporal images not pulled/started in this session).
- P5-B: `pnpm --filter @helm/shared typecheck` PASS; `pnpm --filter @helm/temporal-worker typecheck` PASS (`be4f0a9`).
- P5-C: `pnpm --filter @helm/temporal-worker typecheck` PASS (`38840e7`).
- P5-D routing: `pnpm --filter @helm/shared build` PASS; `pnpm --filter @helm/api typecheck` PASS; `pnpm --filter @helm/temporal-worker typecheck` PASS (`f55eb8a`). No Temporal E2E runtime proof yet.
