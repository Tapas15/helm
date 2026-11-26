# Temporal P5 Runbook (dev/prototype)

## Scope / Invariants
- Temporal is **optional** and **off by default** (`HELM_TEMPORAL_ENABLED=0`).
- DB task/event/receipt tables remain canonical.
- External writes require approval + actionHash + idempotency receipt; no blind retry of uncertain external writes.
- Temporal routes guarded external writes only in `external-write` mode (`gmail.send`, calendar create/update/delete, `browser.external_action`); `all` is explicit opt-in.

## Enable (controlled)
1. Start infra: `docker compose -f infra/docker-compose.yml --profile temporal up -d`
2. API env: `HELM_TEMPORAL_ENABLED=1`, `HELM_TEMPORAL_MODE=external-write`, `TEMPORAL_ADDRESS=localhost:7233`, `TEMPORAL_NAMESPACE=default`, `TEMPORAL_TASK_QUEUE=helm-main`
3. Worker env: same Temporal env + `DATABASE_URL`, `API_URL`, `HELM_TEMPORAL_ACTIVITY_SECRET` (recommended; matches API secret)
4. Start: `pnpm --filter @helm/temporal-worker dev`
5. Optional reconciliation schedule (Temporal-backed): `HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ENABLED=1`, `HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ID=helm-reconciliation-schedule`, reconciliation interval/olderThan/limit envs as needed.
6. Verify: `GET /v1/reconciliation/status` (policy, counts, temporalSchedule), `POST /v1/reconciliation/schedule/ensure` (dev/internal only, `HELM_ALLOW_DEV_AUTH=1`).

## Rollback / Disable (fail-closed)
1. Set `HELM_TEMPORAL_ENABLED=0` (or unset) and restart API/worker.
2. External writes return to direct guarded DB/API path; Temporal routing is disabled.
3. If Temporal routing fails while enabled, API returns 503 `DEPENDENCY_ERROR` (fail-closed), no direct side-effect fallback.
4. Existing uncertain receipts remain in `action_receipts`; reconcile before retry (lookup-first, no blind retry).

## Reconciliation / Uncertain Outcomes
- 5xx/429/503/network unknowns may produce `status=uncertain`; do **not** blindly retry.
- Dry-run: `POST /v1/reconciliation/dry-run` (no mutation, DB-canonical candidate listing). Available as explicit operator path; does not require auto scheduler.
- Run: `POST /v1/reconciliation/run` (user-scoped default; `scope=all` requires `HELM_ALLOW_DEV_AUTH=1`). Explicit operator-invoked lookup-first path; does not blindly retry external writes.
- Auto scheduler (API process): `HELM_RECONCILIATION_ENABLED=1` + interval/olderThan/limit envs. `enabled=false` means auto scheduler disabled; status still reports DB-canonical counts/policy and explicit operator dry-run/run remain available by contract.
- Temporal schedule: `HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ENABLED=1`; use `/v1/reconciliation/schedule/ensure` in dev/internal mode only. Ensure is an explicit dev/internal control; it is not the same as API auto-scheduler enablement.
- Fault injection (test/dev only): `HELM_RECONCILIATION_FAULT_INJECT=lookup_error|lookup_not_found|activity_error`; must preserve no-blind-retry.

## Operator Evidence Bundle (deterministic, no secrets)
Collect before claiming readiness; this is **not** real-env closure proof.
- `GET /v1/reconciliation/status`: capture `ok`, `enabled`, `intervalMs`, `olderThanMs`, `limit`, `policy`, `counts`, `temporalSchedule` (`enabled/scheduleId/status/reason/nextActionTimes` as present). Do not capture tokens, secrets, raw payloads, or PII.
- `POST /v1/reconciliation/dry-run`: capture `ok,dryRun,scanned,candidates[].{id,actionKind,idempotencyKey,createdAt,externalRef}` only; no mutation expected.
- `POST /v1/reconciliation/run` (scoped): capture bounded summary `ok,scanned,reconciled,failed,skipped,errors[]` (error strings bounded by service).
- Schedule ensure (dev/internal only): capture `ok,scheduleId,created,status`.
- Required env/flags to report (values redacted where sensitive): `HELM_TEMPORAL_ENABLED`, `HELM_TEMPORAL_MODE`, `HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ENABLED`, `HELM_RECONCILIATION_ENABLED`, `HELM_ALLOW_DEV_AUTH`, `HELM_TEMPORAL_TEST_MODE` (if set). Never report `HELM_INTERNAL_TOKEN`, `HELM_TEMPORAL_ACTIVITY_SECRET`, DB URLs, provider tokens.

## Evidence / Verification
- Deterministic contracts (local): shared temporal config 9/9; API reconciliation/temporal contracts (repeated-run/fault-injection/run-shape/schedule-shape/scope-safety) PASS; temporal-worker workflows/activities 15/15 incl. single-call no-blind-retry uncertain assertions; API routing fail-closed/bypass/rollback 28/28 targeted.
- Env-gated integration: `HELM_TEMPORAL_ROUTING_TEST=1`, `HELM_TEMPORAL_E2E=1`, `HELM_TEMPORAL_SIDE_EFFECT_E2E=1`, `HELM_TEMPORAL_RECONCILIATION_E2E_TEST=1`, `HELM_RECONCILIATION_API_TEST=1`.
- Blocked for closure: real-provider no-duplicate proof, real Temporal schedule/monitor/fault-injection depth, production/staging disable-flag rollback proof.



