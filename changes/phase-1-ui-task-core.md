# Phase 1 - UI / Task Core

**Status:** `[x]` 100% (coding scope)  
**Blueprint refs:** Phase 1, `03-Frontend-OpenFUSE-UI.md`, `04-Backend-Control-Plane.md`, `10-Data-Model-and-APIs.md`

## Goal
Visible task system with realtime updates. User creates task from chat and sees live state transitions; refresh/reconnect reconstructs timeline; pause/resume/cancel/retry works.

## What we have done
- **Chat/task core UI**: Web chat creates tasks and shows task list/detail, timeline, approvals/evidence/receipts panels.
- **Task controls UX**: Web shows only valid pause/resume/cancel/retry actions for current task status and surfaces control/approval mutation errors (`38533bc`).
- **SSE status clarity**: Event timeline shows explicit `live` / `stale` / `offline` connection state with stale reconnect guidance (`d482c08`, current pass).
- **A11y/UX polish (current pass)**: Task list keyboard-selectable (`role=listbox/option`, Enter/Space), chat log `role=log`/`aria-live`, labels/aria on controls and status pills, disabled/focus-visible styles, small-screen responsive layout.
- **Task export/delete UI**: Web exposes Export (downloads `/v1/tasks/:id/export` JSON) and guarded Delete (explicit confirm + `x-helm-confirm-delete: yes`; server remains gated by `HELM_ALLOW_TASK_DELETE=1`) (`44e89af`).
- **Task controls**: Pause/resume/cancel/retry with CAS/state guards, audit, and task events. Env-gated `task-lifecycle-api` PASS (4/4, includes invalid transition).
- **Idempotency/follow-up guards**: Task create path guards duplicate/follow-up behavior.
- **Browser visibility**: WS screencast preview with polling fallback; takeover-only remote input baseline.
- **Auth wiring**: Web session-token sign-in/sign-out; bearer on fetch/SSE/WS/screenshot; dev `x-user-id` fallback only when `HELM_ALLOW_DEV_AUTH=1` and `HELM_REQUIRE_AUTH!=1`.
- **Task data controls**: Export endpoints `GET /v1/tasks/:id/export`, `POST /v1/tasks/export` capped by `HELM_TASK_EXPORT_MAX` (default 200, hard max 500). Delete gated by `HELM_ALLOW_TASK_DELETE=1` + `x-helm-confirm-delete: yes`, transactional delete + audit. Env-gated `task-export-delete-api` PASS (1/1).
- **Artifact download auth**: Web artifact download links include session token query param so new-tab downloads work when auth is required (`9d6cb23`).
- **WS /v1/ws AG-UI decision (recorded)**: No dedicated `/v1/ws` AG-UI reducer endpoint added for MVP. Current SSE task event stream + browser WS screencast/input cover required realtime/task/takeover flows; AG-UI reducer can be revisited if a consumer requires AG-UI protocol framing.
- **Artifact storage/retention decision (recorded)**: MVP keeps local dev artifact dir / existing artifact storage path; MinIO/object-store abstraction and retention policy polish deferred to P8/ops hardening. No silent deletion policy added.
- **Playwright E2E (current pass)**: Docker app profile rebuilt with `tsx` runtime CMDs and `HELM_TEST_MODE=1` for gated test helpers. `HELM_E2E=1 pnpm --filter @helm/e2e-tests test` PASS (6/6) on rebuilt Docker app stack: SSE reconnect cursor-resume; UI smoke create/export/delete, pause/resume/cancel/retry execution, seeded approval approve/reject execution; browser preview/takeover flow (real browser session, preview image visible, takeover request/resume updates control state, task queued, takeover events emitted).
- **Lease recovery/fault-depth integration proof (current pass)**: `HELM_INTEGRATION_API=1 HELM_API_URL=http://127.0.0.1:8787 pnpm --filter @helm/integration-tests exec vitest run src/worker-lease-recovery-api.test.ts src/worker-fault-depth-api.test.ts --reporter=verbose` PASS (2/2). Proof covers expired leased queued task reclaim, terminal completion, lease cleared, no duplicate terminal `task.completed`/`task.failed` events, and forced reclaim-cycle fault-depth with terminal-event dedupe guard in worker.
- **Test-only E2E helper routes (gated)**: `POST /v1/test/tasks/:id/seed-approval`, `POST /v1/test/tasks/:id/set-status`, and `POST /v1/test/tasks/:id/expire-lease` mounted only when `HELM_TEST_MODE=1`; used by Playwright/integration tests to deterministically seed approval/control/lease states without bypassing normal auth/user scoping.
- **Validation**: `pnpm --filter @helm/web typecheck` PASS; `pnpm --filter @helm/web build` PASS; `pnpm --filter @helm/api exec tsc --noEmit --pretty false` PASS; `pnpm --filter @helm/e2e-tests exec tsc --noEmit --pretty false` PASS; `pnpm --filter @helm/worker exec tsc --noEmit --pretty false` PASS.

## Checklist

### Completed
- [x] Chat-first web UI: task create/list/detail, timeline, approvals/evidence/receipts panels.
- [x] SSE event stream: `GET /v1/events/stream?taskId=&after=` with heartbeat; `useTaskEventStream` dedupe/order/stale indicator.
- [x] Task controls: pause/resume/cancel/retry with CAS/state guards and audit/events.
- [x] Idempotency/follow-up guards in task create path.
- [x] WS screencast preview + polling fallback; takeover-only remote input baseline.
- [x] Web session-token sign-in/sign-out; bearer auth on fetch/SSE/WS/screenshot; dev `x-user-id` fallback only when `HELM_ALLOW_DEV_AUTH=1` and `HELM_REQUIRE_AUTH!=1`.
- [x] Artifact download auth: web download links include auth token query param for new-tab downloads when auth required (`9d6cb23`).
- [x] SSE stream regression: `tests/integration/src/events-sse-api.test.ts` env-gated coverage for cursor resume, Last-Event-ID resume/fallback, invalid cursor validation. (Run in env-gated stack for live pass evidence.)
- [x] SSE route cursor hardening: `Last-Event-ID` fallback when `after` omitted; malformed Last-Event-ID ignored safely; explicit invalid `after` rejected.
- [x] Task lifecycle regression: `tests/integration/src/task-lifecycle-api.test.ts` PASS (4/4, includes invalid control transition).
- [x] Task list limit validation.
- [x] Task export/delete controls: `GET /v1/tasks/:id/export`, `POST /v1/tasks/export` capped by `HELM_TASK_EXPORT_MAX` (default 200, hard max 500), `POST /v1/tasks/:id/delete` gated by `HELM_ALLOW_TASK_DELETE=1` + `x-helm-confirm-delete: yes`; env-gated integration `task-export-delete-api` PASS (1/1).

### Remaining / Blocked
- [x] SSE reconnect cursor-resume E2E proof: Playwright E2E executed against rebuilt Docker app stack with `HELM_E2E=1` PASS (`sse-reconnect.spec.ts`, included in 5/5 suite). Proof covers forced stream drop, stale/offline transition, live recovery, and monotonic/no-duplicate sequence rendering after reconnect/follow-up.
- [x] Live UI action-matrix E2E smoke evidence (coding scope): Playwright `ui-smoke.spec.ts` PASS (4/4) for create/export/delete, seeded approval panel render, pause/resume/cancel/retry control execution, and seeded approval approve/reject execution.
- [x] Browser preview/takeover E2E (coding scope): Playwright `browser-takeover.spec.ts` PASS (1/1) proves real browser session create, preview image visible, takeover request/resume updates control state, task returns queued, takeover request/resume events emitted.
- [x] DB lease worker heartbeat/recovery/fault-depth proof (coding scope): env-gated `worker-lease-recovery-api.test.ts` + `worker-fault-depth-api.test.ts` PASS (2/2); worker terminal-event dedupe guard prevents duplicate `task.completed`/`task.failed` across reclaim/failure boundaries. Broader fault-injection matrix remains P5 hardening depth.
- [x] Decide/record WS `/v1/ws` AG-UI reducer need: deferred for MVP; SSE + browser WS cover current flows.
- [x] Artifact storage abstraction/retention polish decision: local dev dir/current artifact path for MVP; MinIO/retention abstraction deferred to P8/ops hardening.
- [x] Task export/delete web controls: Export downloads redacted task export JSON; Delete is explicit-confirm and server-gated (`HELM_ALLOW_TASK_DELETE=1` + confirm header).
- [~] Richer inline cards / activity-approval centers / persona-memory-provider UI / responsive-accessibility pass: current pass added keyboard/focus/ARIA/responsive polish; deeper design-system pass remains optional backlog.

## Evidence
- 2026-11-22: `pnpm --filter @helm/web typecheck` PASS, `pnpm --filter @helm/web lint` PASS after SSE wiring.
- 2026-11-24: `events-sse-api` PASS (3/3, env-gated); `task-lifecycle-api` PASS (4/4, env-gated); `task-export-delete-api` PASS (1/1, env-gated).
- 2026-11-27: Docker app profile rebuilt/recreated (`api`, `worker`, `browser-worker`, `web`) with `tsx` runtime CMDs and `HELM_TEST_MODE=1` for gated E2E helpers. `HELM_E2E=1 pnpm --filter @helm/e2e-tests test` PASS (4/4): `sse-reconnect.spec.ts` PASS (forced drop -> stale/offline -> live recovery, monotonic/no-duplicate seqs after follow-up); `ui-smoke.spec.ts` PASS (3/3: create/export/delete, seeded approval panel render, paused/failed control validity). Targeted checks: `pnpm --filter @helm/web typecheck` PASS, `pnpm --filter @helm/web build` PASS, `pnpm --filter @helm/api exec tsc --noEmit --pretty false` PASS, `pnpm --filter @helm/e2e-tests exec tsc --noEmit --pretty false` PASS.
- Dev web: `http://localhost:5173` (Docker app profile).
