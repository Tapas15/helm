# Phase 5 - Temporal Reliability Layer

**Status:** `[~]` P5-A planning/infra scaffold started (2026-11-23)  
**Blueprint refs:** Phase 5, `08-Temporal-Reliable-Execution.md`, `changes/ADR-002-temporal-scope.md`

## Goal
Durable execution for real tasks: Temporal workflows, signals/queries, idempotent activities, schedules, uncertain-write reconciliation. No blind retry of uncertain external writes.

## Completed
- [x] P5-A: ADR-002 drafted (incremental migration; Temporal for high-risk/long-running/external-write workflows first; DB lease worker remains fallback behind feature flag).
- [x] P5-A: Temporal dev infra scaffold added to docker-compose (profile-gated; not default startup path).

## Remaining
- [ ] P5-B: Temporal client/worker package boundary (`backend/temporal-worker` or package), config/env, feature flag routing.
- [ ] P5-C: TaskWorkflow wrapping approval-gated external actions (Gmail send, Calendar create, guarded browser external actions) with idempotent activities.
- [ ] P5-D: Signals/queries (`approve/reject/cancel/pause/resume/provideInput`, `getStatus/getPendingApprovals`); uncertain-write reconciliation workflow.
- [ ] P5-E: Retry policies by action class; non-retryable `PolicyDenied/ValidationError/ApprovalRejected/UncertainExternalOutcome`.
- [ ] P5-F: Schedules/monitors; dead-letter/operator runbooks; observability.
- [ ] Worker kill/restart mid-task: no duplicate side effect (integration proof).
- [ ] Disable flag rollback proof.

## Verification Evidence
- P5-A: docs/docker-compose scaffold only; no runtime verification yet (Temporal images not pulled/started in this session).
