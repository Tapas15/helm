# Phase 1 - OpenFUSE-Style UI + Task Core

**Status:** `[~]` In progress (SSE live timeline wired; WS/AG-UI polish pending)  
**Blueprint refs:** Phase 1, `03-Frontend-OpenFUSE-UI.md`, `04-Backend-Control-Plane.md`, `10-Data-Model-and-APIs.md`

## Goal
Visible task system with realtime updates. User creates task from chat and sees live state transitions; refresh/reconnect reconstructs timeline; pause/resume/cancel/retry works.

## Completed
- [x] SSE event stream: `GET /v1/events/stream?taskId=&after=` with heartbeat.
- [x] Frontend `useTaskEventStream` hook: EventSource, dedupe by `id/sequence`, ordered cache, stale indicator.
- [x] `App.tsx` wired to SSE timeline; task list refreshes on task events.

## Remaining
- [ ] Optional WS `/v1/ws` (SSE may be sufficient for MVP; decide/record).
- [ ] AG-UI reducer hardening: reconnect cursor resume (`after=lastSequence`), explicit out-of-order buffer, richer stale/offline UX.
- [ ] DB lease worker improvements (heartbeat, recovery, compare-and-swap tests).
- [ ] Artifact storage abstraction (local dev dir / MinIO).
- [ ] UI state reflects backend truth; optimistic only for view controls.
- [ ] E2E smoke: create task, live update, refresh/reconnect, controls.

## Verification Evidence
- 2026-11-22: `pnpm --filter @helm/web typecheck` PASS, `pnpm --filter @helm/web lint` PASS after SSE wiring. Full E2E smoke pending.
