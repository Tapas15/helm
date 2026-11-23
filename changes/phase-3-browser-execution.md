# Phase 3 - Browser Execution + Takeover

**Status:** `[~]` In progress  
**Blueprint refs:** Phase 3, `06-Deterministic-Browser-and-Computer-Execution.md`

## Goal
Real visible browser work with Playwright worker, live preview, takeover/return control, deterministic playbook runner v1.

## Completed
- [x] Live preview baseline: browser-worker CDP screencast frames streamed over WS (/v1/sessions/:id/stream), proxied by API, rendered in web with polling fallback and stream status.
- [x] Playwright Chromium runtime smoke and session API verification (create/navigate/snapshot/screenshot/close). Evidence: `changes/BROWSER_SMOKE_2026-11-22.md`.
- [x] Browser-worker Playwright session scaffold: create/get/navigate/click/fill/snapshot/screenshot/close; token auth.
- [x] Worker executes browser-kind tasks through browser-worker and records session/navigate/snapshot/screenshot/close events in timeline.
- [x] Basic browser preview in web UI via polling screenshot PNG (`/v1/browser/sessions/:id/screenshot.png`), 2.5s refresh; sessions kept open with 5m preview TTL.
- [x] Takeover/return control baseline: shared control state, browser-worker request/resume endpoints, API proxy, web takeover/resume buttons, task events/audit (`browser.takeover.requested/resumed`), task state `waiting_input` on takeover and `queued` on resume.
- [x] Worker/runtime takeover pause/resume: worker persists `activeBrowserSessionId`, browser runtime resumes existing session, detects takeover and yields `waiting_input`; resume requeues and completes. Smoke PASS.
- [x] Evidence artifact baseline: screenshot/DOM snapshot files written with sha256/size/metadata; persisted to `browser_artifacts` DB rows.
- [x] External browser side-effect endpoint guarded by approved `actionHash` + `approvalId` + idempotency receipt (`POST /v1/browser/sessions/:id/external-action`); deduped replay returns same receipt.
- [x] Runtime/browser-task approved high-risk path routes through guarded external-action API. Smoke PASS.

## Remaining
- [~] Live preview stream (WS/CDP screencast) added; interactive remote control baseline added for takeover mode (click/type/Enter over WS). Pending: richer controls (scroll/drag/keyboard modifiers), authz hardening, live smoke.
- [ ] Evidence UI/downloads, richer artifact types (downloads, receipts).
- [ ] Browser crash reported/recovered safely; in-memory browser session recovery/reconnect after browser-worker restart.
- [ ] Optional Obscura CDP backend evaluation behind `BrowserExecutor` (no AGPL copy; no bypass claims).

## Verification Evidence
- 2026-11-23: pnpm --filter @helm/browser-worker typecheck PASS; pnpm --filter @helm/api typecheck PASS; pnpm --filter @helm/web typecheck PASS (WS screencast proxy + takeover input UI).
- `changes/BROWSER_SMOKE_2026-11-22.md`
- 2026-11-22 smoke: browser task `Visit example.com and capture evidence` -> `succeeded`; session remained ready for preview; `browser_artifacts` rows recorded for screenshot + dom_snapshot.
- 2026-11-22 smoke: external action denied 403 when approval pending; approved action executed once with receipt/artifact; replay deduped same receipt.
- 2026-11-23 smoke: browser task succeeded; takeover request moved task to `waiting_input` and emitted `browser.takeover.requested`; resume requeued task and second run completed with `browser.takeover.resumed` in timeline.
- 2026-11-23 smoke: approved high-risk browser task executed through guarded external-action path; receipt executed with result; `browser.external_action.executed` event recorded.

