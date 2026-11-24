# Phase 5 - Temporal Reliability Layer

**Status:** `[~]` P5-D/E partial: routing proofs + DB-canonical uncertain-receipt reconciliation baseline (2026-11-24)  
**Blueprint refs:** Phase 5, `08-Temporal-Reliable-Execution.md`, `changes/ADR-002-temporal-scope.md`

## Goal
Durable execution for real tasks: Temporal workflows, signals/queries, idempotent activities, schedules, uncertain-write reconciliation. No blind retry of uncertain external writes.

## Completed
- [x] P5-A: ADR-002 drafted (incremental migration; Temporal for high-risk/long-running/external-write workflows first; DB lease worker remains fallback behind feature flag).
- [x] P5-A: Temporal dev infra scaffold added to docker-compose (profile-gated; not default startup path).
- [x] P5-B: `packages/shared/src/temporal.ts` config/feature flags; `@helm/temporal-worker` scaffold (client bootstrap, workflow signal/query skeleton, activity scaffold); shared/temporal-worker typecheck PASS (`be4f0a9`).
- [x] P5-C: Guarded Temporal activities for `gmail.send`/`calendar.create_event` route through existing guarded API paths with approval/actionHash/idempotency; 5xx/429/503 mapped to uncertain; workflow retry policy with non-retryable classes (`38840e7`).
- [~] P5-D: API Temporal client routing added behind `HELM_TEMPORAL_ENABLED=external-write` for `gmail.send` and `calendar.create_event` (`f55eb8a`). Returns 202 + workflowId/runId when routed; fail-closed 503 on Temporal routing failure. DB/direct guarded path remains default fallback. Added stub test mode + internal activity secret loop guard + env-gated stub routing integration (`7497b0c`, PASS 1/1). Real Temporal server E2E added: compose dynamic config fixed, workflowId dedupe/idempotency proven against running Temporal (`528551c`, PASS 1/1). Mock-provider side-effect E2E added: worker restart/idempotent receipt (<=1 per idempotency key) and uncertain reconciliation path PASS (`1ecca7b`, 1/1).

## Remaining
- [~] P5-D: Added DB-canonical reconciliation service + `/v1/reconciliation/status|run` + optional in-process scheduler (`HELM_RECONCILIATION_*`) for uncertain receipts; lookup-first, no blind retry. Real external provider no-duplicate proof (Google creds/sandbox) and fault-injected uncertain-outcome proof remain external/manual.
- [~] P5-C/D scope: `browser.external_action` Temporal activity/routing present; uncertain receipt reconciliation baseline present. Temporal-native reconciliation workflow/schedule/monitor still pending.
- [ ] P5-E: Retry policies by action class; non-retryable `PolicyDenied/ValidationError/ApprovalRejected/UncertainExternalOutcome` (scaffolded in workflow, needs integration proof).
- [ ] P5-F: Schedules/monitors; dead-letter/operator runbooks; observability.
- [ ] Disable flag rollback proof.

## Verification Evidence
- P5-A: docs/docker-compose scaffold only; no runtime verification yet (Temporal images not pulled/started in this session).
- P5-B: `pnpm --filter @helm/shared typecheck` PASS; `pnpm --filter @helm/temporal-worker typecheck` PASS (`be4f0a9`).
- P5-C: `pnpm --filter @helm/temporal-worker typecheck` PASS (`38840e7`).
- P5-D routing: `pnpm --filter @helm/shared build` PASS; `pnpm --filter @helm/api typecheck` PASS; `pnpm --filter @helm/temporal-worker typecheck` PASS (`f55eb8a`). No Temporal E2E runtime proof yet.
- P5-D stub integration: `pnpm --filter @helm/api typecheck` PASS; `pnpm --filter @helm/temporal-worker typecheck` PASS; `pnpm --filter @helm/integration-tests typecheck` PASS; `HELM_TEMPORAL_ROUTING_TEST=1 pnpm --filter @helm/integration-tests test -- temporal-routing-api` PASS 1/1 (`7497b0c`).
- P5-D real Temporal E2E: compose profile healthy after dynamic config mount fix; `HELM_TEMPORAL_E2E=1 TEMPORAL_ADDRESS=localhost:7233 pnpm --filter @helm/integration-tests test -- temporal-e2e` PASS 1/1 (`528551c`).
- P5-D mock side-effect E2E: `pnpm --filter @helm/api typecheck` PASS; `pnpm --filter @helm/integration-tests typecheck` PASS; `HELM_TEMPORAL_SIDE_EFFECT_E2E=1 ... pnpm --filter @helm/integration-tests test -- temporal-side-effect-e2e` PASS 1/1 (`1ecca7b`).
