# Planning Missing Items — Helm

**Date:** 2026-11-23  
**Purpose:** Concrete checklist of blueprint/planning items not yet implemented or not fully tracked. Derived from `Planning/00-13` + `MASTER-TECHNICAL-BLUEPRINT.md`. Use with `CURRENT_STATE.md`, `BLUEPRINT_GAP_ANALYSIS_2026-11-23.md`, `BINDING_AUDIT_2026-11-23.md`.

## P0 Foundation / Repo
- [ ] Remote CI evidence (GitHub Actions) verified and linked in changes.
- [ ] ESLint-depth lint rules (currently `tsc --noEmit` placeholders).
- [ ] `tsconfig` dist/src path workaround cleanup for builds/typechecks.
- [ ] tsx watch stability (known worker/API watch instability).
- [ ] AGENTS/command/agent structure aligned with Kilo/competition conventions as needed.

## P1 UI / Task Core
- [ ] **Premium White UI design system rollout** (see `changes/DESIGN-premium-white-ui.md`): Helm tokens, white/warm-white surfaces, soft off-white sidebar, Geist/Inter, Lucide, restrained blue/violet accent, 10–14px corners, subtle borders/shadows, smooth Motion animations.
- [ ] Proper thread/conversation abstraction (task-as-thread is temporary).
- [ ] SSE reconnect cursor resume E2E proof (hook exists; no live proof).
- [ ] WS `/v1/ws` AG-UI reducer decision (optional vs required).
- [ ] Richer inline cards: tool call, approval, browser takeover, diff, receipt.
- [ ] Activity/approval centers and notifications UX.
- [ ] Persona/memory/provider-model selection UI.
- [ ] Resizable three-panel workspace, command palette/keyboard shortcuts, contextual menus/popovers, responsive mobile navigation.
- [ ] Interactive task timelines, live agent activity, drag-and-drop agent workflows (React Flow/dnd-kit), browser preview/takeover polish, approval dialogs.
- [ ] Accessibility/UX quality pass (keyboard, focus, ARIA, responsive).
- [ ] UI stack migration plan: Tailwind v4, shadcn/ui+Radix, Motion, Zustand, TanStack Query, Tiptap, Recharts, WebSockets+SSE.

## P2 Runtime / Model
- [ ] Provider/model selection UI and persisted config; tool-capable model allowlist/warning.
- [ ] Robust tool schema/guardrails for small/local models (schema leak/refusal/timeout handling).
- [ ] Full browser-tool E2E with approvals through UI.
- [ ] Richer tool registry/policy; capability-based tool exposure.
- [ ] Real Hermes adapter boundary contract (optional isolated adapter; no Hermes code copied).
- [ ] Interrupt/resume/checkpoint semantics for long-running runs.
- [ ] Runtime evals: tool-calling reliability, approval correctness, recovery.

## P3 Browser / Computer Execution
- [ ] Full crash/reconnect/WS stability and interactive takeover live smoke.
- [ ] Deterministic recreate/reconnect contract when restore impossible.
- [ ] Session ownership/audit for screenshot/snapshot/close/create/stream.
- [ ] WS authz/ownership hardening (remove dev `userId` query parity).
- [ ] Richer remote control beyond takeover-only click/type/Enter.
- [ ] Playbook runner contract; BrowserOS adapter evaluation/ADR (external only, AGPL review).
- [ ] Downloads/network evidence capture; artifact retention policy.
- [ ] Navigate risk classification/policy matrix (allowlist vs approval vs block).

## P4 Approvals / Vault / Connectors
- [ ] Complete binding audit regression tests: navigate guard, approval resolve replay/conflict/actionHash mismatch, session ownership/audit.
- [ ] Vault/credential broker; secret refs only in DB/events/logs/runtime.
- [ ] Connector registry + manifest schema (`kind`, auth, scopes, actions, risk, idempotency, approval).
- [ ] OAuth connect/refresh/revoke lifecycle; token health checks.
- [ ] Gmail connector (search/read/draft/send with approval-gated send).
- [ ] Google Calendar connector (list/create/update/delete with policy).
- [ ] Uncertain-outcome reconciliation for external writes.
- [ ] MCP integration policy: allowlist, pinned digest/version, sandbox, trust levels.

## P5 Temporal / Reliability
- [ ] Temporal workflows/signals/queries for long-running/high-risk actions.
- [ ] Retry policies by action class; no blind retry of uncertain external writes.
- [ ] Reconciliation workflow; schedules/monitors.
- [ ] Dead-letter/incident surfacing and operator runbooks.

## P6 BrowserOS Deterministic Upgrade
- [ ] Capability detection/fallback matrix (Playwright default, BrowserOS optional).
- [ ] Recorder/import format; benchmark suite.

## P7 Memory / Skills / Proactivity
- [ ] Memory CRUD/provenance/sensitivity/confidence; inspect/edit/delete/export.
- [ ] Skill registry/versioning/tests/permissions; draft-before-enable.
- [ ] Proactivity/monitors/ideas with explicit user opt-in and policy gates.
- [ ] Self-improvement loop implementation (design exists: `DESIGN-self-improvement-loop.md`) - feedback capture, proposal/eval gate, versioned activation, rollback.

## P8 Hardening / Release
- [ ] Security suite: prompt injection, SSRF/egress, secret redaction verification, authz tests.
- [ ] Chaos/recovery: duplicate side-effect, crash/restart, stale lease, stream reconnect.
- [ ] Backup/export/retention/privacy policy; PII logging audit.
- [ ] Observability/SLOs/runbooks; debug bundle export.
- [ ] Dubai submission compliance: provable commit provenance, organizer promotional-rights/IP text, third-party notices refresh on dep changes.
- [ ] `FIX_LOG.md` entries for recent non-trivial fixes; regression tests linked.

## Cross-cutting / Contracts
- [ ] ADRs: canonical event schema (AG-UI extension vs custom), secret vault, observability stack, BrowserOS/Obscura external adapter policy.
- [ ] `HelmError` wiring end-to-end; no silent failures; trace fields in all critical paths.
- [ ] Idempotency/audit coverage matrix for every mutating endpoint/tool.
- [ ] Model/provider routing policy by sensitivity/capability/cost (local-only for restricted data).
