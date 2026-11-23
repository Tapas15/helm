# Current State — Helm

**Last updated:** 2026-11-23T05:15:00Z (session: blueprint loaded, gap/binding audit, navigate guard)  
**Active phases:** Phase 1 UI/Task Core (`[~]`), Phase 3 Browser Execution (`[~]`), Phase 4 Approvals/Vault/Connectors (`[~]`)  
**Next move:** Complete binding audit remaining gaps (approval resolve idempotency/conflict, session ownership/audit for screenshot/snapshot/close/create), add regression tests for navigate guard and approval replay, then continue browser recovery hardening.

## Project Identity
- **Name:** Helm (`@helm/*`)
- **Goal:** Personal AI operating assistant platform from scratch per blueprint: OpenFUSE-style control surface + Helm-native runtime + deterministic browser execution + reliability/security.
- **Blueprint:** `C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\Personal_assistant\Planning\MASTER-TECHNICAL-BLUEPRINT.md`

## Current Status Snapshot

- - - - **Overall:** ~65% complete (Phases 0-8 equal weight; usable prototype baseline).
- **Phase 0 - Foundation:** `[~]` 90%.
- **Phase 1 - UI/Task Core:** `[~]` 87%. Chat-first UI (message bubbles, live streaming assistant delta, Enter-to-send, follow-up messages on same task, tool-call/result cards from runtime/browser events), task list/control, SSE timeline, approvals, WS screencast preview with polling fallback, takeover controls + takeover-only click/type/Enter input, evidence/receipts panel.
- **Phase 2 - Agent Runtime:** `[~]` 53%. Helm-native runtime; normalized `runtime.*`; OpenAI-compatible streaming adapter; basic model tool-calling loop (browser navigate/snapshot/click, guarded click approval/hash/idempotency); persona/browser-session/recent-message context injected; batched delta persistence; task messages persisted; follow-up endpoint requeues task with user message. Ollama smoke: `llama3.2:latest` completed Helm runtime tool-calling smoke (navigate+snapshot tool events observed); small models may leak tool schema/refuse. Pending: full end-to-end live UI smoke with configured model, richer tool registry/policy, provider/model selection UI, proper multi-turn thread abstraction.
- **Phase 3 - Browser Execution:** `[~]` 75%. Playwright browser-worker smoke pass; CDP screencast WS stream + API WS proxy + web live preview with polling fallback; takeover-only remote click/type/Enter over WS; 5m session TTL; takeover request/resume persisted/emitted and worker pause/resume PASS; DOM/screenshot artifacts persisted; guarded external-action endpoint enforces approval+actionHash+idempotency receipt; API guards browser click/fill/external-action with approval+actionHash+idempotency; navigate now requires approval guard for non-allowlisted domains (allowlisted low-risk nav audited); browser-worker persists session metadata/storageState and restores missing in-memory session after restart. Pending: full WS stability/interactive-input live smoke, tighter session ownership/audit for observe/close/create, richer remote control, full crash recovery.
- **Phase 4 - Approvals/Vault/Connectors:** `[~]` 47%. Approval flow, `action_receipts`, guarded external-action API, runtime wired through guarded path, dedupe/audit/event; worker receipt hardening prevents false executed receipts for browser/external approvals; browser click/fill/navigate(non-allowlisted)/external-action routes guarded. Binding audit doc added. Pending: approval resolve idempotency/conflict hardening, session ownership/audit, vault/policy boundaries.
- **Phase 5-8:** `[ ]` 0-5%.

## Usable Prototype Definition
- [~] Create browser task -> see preview/session status.
- [x] Request takeover/resume from UI; control state persisted/emitted; agent pauses and resumes.
- [x] Risky browser action pauses for approval; approved action executes once via guarded `actionHash`+idempotency path; reject blocks.
- [x] Evidence artifacts/receipts persisted and visible in UI/API.
- [~] Live preview: WS screencast stream + takeover-only remote input implemented (typecheck/test PASS; live stack smoke pending).`n- [~] Clean restart/recovery: persisted task/event/approval/receipt/artifact state survives restart; in-memory browser sessions do not.









