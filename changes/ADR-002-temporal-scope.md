# ADR-002 - Temporal Scope and Migration

**Status:** Proposed (2026-11-23)  
**Phase:** P5 Temporal / Reliability  
**Owners:** Helm core  
**Related:** `Planning/08-Temporal-Reliable-Execution.md`, `changes/phase-5-temporal-reliability.md`, AGENTS.md (major capability requires ADR/plan before implementation)

## Context
Helm currently executes tasks via a DB lease worker (`backend/worker`) with idempotency receipts, approval gates, SSE events, and browser recovery. This is sufficient for MVP short-running tasks but lacks durable workflow history/replay, native signals/queries, durable timers/schedules, and standardized activity retry/timeout policies for long-running/high-risk/external-write workflows.

## Decision
Adopt **Temporal as the durable execution layer for high-risk and long-running workflows first**, while keeping the existing DB lease worker as the default/fallback path behind a feature flag during migration.

### Scope (initial)
- **In scope (P5 MVP):** Temporal dev infra; workflow client/worker package boundary; `TaskWorkflow` for external side-effect actions requiring approval/idempotency (Gmail send, Calendar create, guarded browser external actions); signals (`approve`, `reject`, `cancel`, `pause`, `resume`, `provideInput`); queries (`getStatus`, `getPendingApprovals`); idempotent activity wrappers around existing guarded routes/services; uncertain-outcome reconciliation activity/workflow; retry policy matrix by action class.
- **Deferred:** Full migration of all assistant/browser reads to Temporal; schedules/monitors for all use cases; production Temporal cluster hardening/mTLS; multi-tenant namespace isolation beyond dev defaults; replacing DB task table as source of truth.

### Invariants
- No blind retry of uncertain external writes. All external writes must have idempotency key + action receipt + approval when required.
- Temporal activities call existing Helm guarded contracts/services; they do not bypass approval/audit/vault/redaction.
- DB task/event/receipt tables remain canonical user-visible state for UI; Temporal workflow state is execution durability state and must be mirrored via events/audit.
- Feature flag: `HELM_TEMPORAL_ENABLED=1` enables Temporal path for selected task kinds/actions; default off until verified.

## Alternatives
- **Keep DB lease worker only:** simpler, but weak durable timers/signals/replay and more custom reliability code. Rejected for P5 target.
- **Migrate all tasks to Temporal immediately:** high risk/regression surface. Rejected; incremental migration preferred.
- **Use another workflow engine:** Temporal chosen per blueprint and operational fit.

## Risks / Rollback
- **Risk:** Dual execution paths cause drift. *Mitigation:* shared action contracts/receipts, feature flag, integration tests, explicit routing rules.
- **Risk:** Activity retries duplicate side effects. *Mitigation:* idempotency keys/receipts, uncertain reconciliation, non-retryable error classes.
- **Rollback:** disable `HELM_TEMPORAL_ENABLED`, keep DB lease worker path; do not remove DB worker until Temporal path has parity + evidence.

## Verification Plan
- `pnpm typecheck`/`build` pass.
- Integration: worker kill/restart mid-workflow does not duplicate external side effect (idempotency receipt).
- Integration: approval signal resumes workflow; rejection cancels without execution.
- Integration: uncertain write enters reconciliation, not blind retry.
- Update `changes/FIX_LOG.md` for any non-trivial fix; update CURRENT_STATE/SESSION_LOG/ROADMAP.

## Implementation Slices
1. **P5-A Planning/infra scaffold (this slice):** ADR, plan update, docker-compose temporal dev scaffold, env docs.
2. **P5-B Package/boundary:** `packages/temporal` or `backend/temporal-worker` with client, workflow/activity skeleton, feature flag routing.
3. **P5-C Approval-gated external actions:** route Gmail send/Calendar create through Temporal activities when enabled.
4. **P5-D Signals/reconciliation:** approval/cancel/pause/resume signals; uncertain-outcome reconciliation workflow.
5. **P5-E Schedules/monitors:** Temporal schedules for monitors/reminders; observability/runbooks.
