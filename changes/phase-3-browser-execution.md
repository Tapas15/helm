# Phase 3 - Browser Execution + Takeover

**Status:** `[~]` 93%  
**Blueprint refs:** Phase 3, `06-Deterministic-Browser-and-Computer-Execution.md`

## Goal
Real visible browser work with Playwright worker, live preview, takeover/return control, deterministic execution baseline.

## What we have done
- **Playwright browser worker**: Create/get/navigate/click/fill/snapshot/screenshot/close with token auth.
- **Live preview**: CDP screencast WS stream (`/v1/sessions/:id/stream`) proxied by API; web renders with polling fallback.
- **Takeover/return control**: Request/resume endpoints, API proxy, web buttons, task `waiting_input` on takeover and requeue on resume, events/audit. Worker/runtime pauses/resumes; persists `activeBrowserSessionId`.
- **Evidence/artifacts**: Screenshot/DOM snapshot files with sha256/size/metadata; `browser_artifacts` rows.
- **Guarded external actions**: `POST /v1/browser/sessions/:id/external-action` requires approved `approvalId` + matching `actionHash` + idempotency receipt; dedupe same receipt; executing claim 409. Runtime/browser-task high-risk path routes through guarded API.
- **Ownership/authz/recovery hardening**: Session ownership checks, guarded routes, browser WS bearer authz via shared resolver; legacy unbound sessions hard-blocked 403 `legacy-unbound-session-hard-block`; `POST /v1/browser/sessions/:id/rebind`.
- **Crash recovery**: Browser crash/stale-target/in-memory-loss recovery restores persisted session and retries action once.
- **Regression coverage**: Env-gated integration suite includes ownership/guarded/takeover/stream-status/ws-authz/restart-recovery/session-create/legacy-rebind tests; smoke evidence in `BROWSER_SMOKE_2026-11-22.md`.

## Checklist

### Completed
- [x] Playwright browser-worker: create/get/navigate/click/fill/snapshot/screenshot/close; token auth.
- [x] CDP screencast WS stream (`/v1/sessions/:id/stream`) proxied by API; web renders with polling fallback.
- [x] Takeover/return control: request/resume endpoints, API proxy, web buttons, task `waiting_input` on takeover and requeue on resume, events/audit.
- [x] Worker/runtime takeover pause/resume; persists `activeBrowserSessionId`; resume completes.
- [x] Evidence artifacts: screenshot/DOM snapshot files with sha256/size/metadata; `browser_artifacts` rows.
- [x] External browser side-effect endpoint guarded by approved `actionHash` + `approvalId` + idempotency receipt (`POST /v1/browser/sessions/:id/external-action`); dedupe same receipt.
- [x] Runtime/browser-task approved high-risk path routes through guarded external-action API.
- [x] Browser crash/stale-target/in-memory-loss recovery restores persisted session and retries action once.
- [x] Ownership/authz hardening: session ownership checks, guarded routes, browser WS bearer authz via shared resolver.
- [x] Legacy unbound browser sessions hard-blocked 403; `POST /v1/browser/sessions/:id/rebind`.
- [x] Integration regressions: ownership/guarded/takeover/stream-status/ws-authz/restart-recovery/browser-session-create/legacy-rebind APIs present and passing in env-gated suite history.

### Remaining / Blocked
- [x] API WS preview proxy forwards client->upstream takeover input messages (binary-safe) in `backend/api/src/index.ts` (2026-11-25). Live interactive smoke still pending.
- [ ] Live interactive smoke for WS preview + takeover input (click/type/scroll/drag/modifiers). **Blocked:** no browser automation surface in shell.
- [ ] Richer remote controls (scroll/drag/keyboard modifiers), stability polish.
- [ ] Browser crash/restart recovery integration coverage expansion for more edge cases.
- [ ] Richer artifact types/downloads/network evidence capture; retention policy.
- [ ] Optional Obscura/BrowserOS CDP backend evaluation behind `BrowserExecutor` (no AGPL/copyleft copy; no bypass claims).

## Evidence
- `changes/BROWSER_SMOKE_2026-11-22.md`.
- 2026-11-22/23 smoke: browser task succeeded; takeover/resume events; guarded external action dedupe/receipt; approved high-risk path through guarded API.
- Integration tests present: `browser-external-action`, `browser-guarded-ownership-api`, `browser-legacy-rebind-api`, `browser-navigate-guard-api`, `browser-ownership-api`, `browser-restart-recovery-api`, `browser-session-create-ownership-api`, `browser-stream-status-ownership-api`, `browser-takeover-ownership-api`, `browser-ws-authz-api`.
