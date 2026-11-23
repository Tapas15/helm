# Temporal P5 Runbook (dev/prototype)

## Enable
- Start infra: `docker compose -f infra/docker-compose.yml --profile temporal up -d`
- API env: `HELM_TEMPORAL_ENABLED=1`, `HELM_TEMPORAL_MODE=external-write`, `TEMPORAL_ADDRESS=localhost:7233`, `TEMPORAL_NAMESPACE=default`, `TEMPORAL_TASK_QUEUE=helm-main`
- Worker: `pnpm --filter @helm/temporal-worker dev` (same env + `API_URL`, `HELM_TEMPORAL_ACTIVITY_SECRET`)

## Rollback (disable flag)
- Set `HELM_TEMPORAL_ENABLED=0` (or unset). Restart API/worker.
- External writes return to direct guarded DB/API path; no Temporal routing.
- Existing uncertain receipts remain in `action_receipts` and must be reconciled before retry.

## Uncertain outcomes
- 5xx/429/503/network unknowns are marked `uncertain`, never blindly retried.
- Reconcile: `POST /v1/receipts/:id/reconcile` with `{ outcome: "executed"|"failed" }`; Gmail/Calendar auto-lookup runs when possible.

## Evidence
- `HELM_TEMPORAL_ROUTING_TEST=1` stub routing integration PASS.
- `HELM_TEMPORAL_E2E=1` real Temporal workflow dedupe PASS.
- `HELM_TEMPORAL_SIDE_EFFECT_E2E=1` mock-provider worker-restart/idempotent receipt/uncertain reconcile PASS.
