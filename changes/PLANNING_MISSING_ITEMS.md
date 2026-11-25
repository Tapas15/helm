# Planning Missing Items ? Helm

**Last updated:** 2026-11-24T17:30:00Z  
**Status:** Active checklist (cross-check with `CURRENT_STATE.md` and `phase-1`..`phase-8`).  
**Rule:** Mark `[x]` only with evidence (code/test/CI/doc). Keep blocked items visible with blocker reason.

## P0 Foundation / Repo
- [x] Remote CI evidence verified: GitHub Actions `45438392752` PASS, `45441229198` PASS (main); later pushes also green.
- [x] ESLint-depth lint rules (moved from `tsc --noEmit` placeholders to ESLint).
- [~] `tsconfig` dist/src path workaround cleanup: removed `../../packages/*/src/**/*.ts` include workaround from `backend/api`, `backend/worker`, `backend/browser-worker` (2026-11-25, local gates PASS). Remaining: confirm clean CI/fresh-clone evidence after push.
- [x] tsx watch stability hardened (`--clear-screen=false --ignore dist/** --ignore node_modules/**`).
- [x] Drizzle migration-history alignment script made cwd-independent and idempotent (`scripts/align-drizzle-journal.mjs`); verified from repo root and `packages/db`. Fresh-clone CI confirmation after push.

## P1 UI / Task Core
- [x] Chat-first task UI, SSE timeline, approvals/evidence/receipts, WS preview + polling fallback, takeover controls.
- [x] Session-token sign-in/sign-out; bearer on fetch/SSE/WS/screenshot.
- [x] SSE stream regression (`events-sse-api` PASS 3/3, cursor resume + invalid cursor validation).
- [x] Task lifecycle regression (`task-lifecycle-api` PASS 4/4).
- [x] Task export/delete controls with env-gated integration PASS (1/1).
- [ ] Live UI E2E smoke evidence (create/approve/reject/retry/pause/resume/cancel/preview). **Blocked:** no browser automation surface in shell.
- [ ] SSE reconnect cursor-resume E2E proof beyond env-gated API integration test.
- [ ] Decide/record WS `/v1/ws` AG-UI reducer need (SSE may be sufficient for MVP).
- [ ] DB lease worker heartbeat/recovery/fault-injection depth beyond current coverage.
- [ ] Richer inline cards/activity-approval centers/persona-memory-provider UI/responsive-accessibility pass.
- [ ] Proper thread/conversation abstraction (task-as-thread is temporary).

## P2 Runtime / Model
- [x] `AgentRuntime` contract + HelmNativeRuntime; normalized `runtime.*`; OpenAI-compatible streaming; basic tool-calling loop.
- [x] Local Ollama default; guardrails (timeout/max_tokens/redaction/allowlist).
- [x] Tool policy/registry, high-risk approval gating, browser-intent gating, thread abstraction, model override/config validation API.
- [x] Worker tests PASS (11/11).
- [ ] Live E2E across real browser + connector flows. **Blocked:** real env/live smoke.
- [ ] Integration-driven behavior tweaks and model/provider behavior evidence.
- [ ] Richer provider/model routing policy by sensitivity/capability/cost.
- [ ] Interrupt/resume/checkpoint semantics for long-running runs.
- [ ] Runtime evals: tool-calling reliability, approval correctness, recovery.

## P3 Browser / Computer Execution
- [x] Playwright browser-worker, CDP screencast WS + API proxy, polling fallback.
- [x] Takeover pause/resume, artifacts (screenshot/DOM snapshot sha256/metadata).
- [x] Guarded external browser action with approval/actionHash/idempotency/receipt.
- [x] Ownership/authz hardening, WS bearer authz, legacy unbound session hard-block/rebind.
- [x] Stale-session restart recovery + direct/API-observable integration coverage.
- [ ] Live interactive WS/takeover smoke (click/type/scroll/drag/modifiers). **Blocked:** no browser automation surface.
- [ ] Richer remote control and stability polish.
- [ ] Richer artifact types/downloads/network evidence capture; retention policy.

## P4 Approvals / Vault / Connectors
- [x] Approval/actionHash/idempotency receipt gating; dedupe same receipt; 409 executing claim.
- [x] Local vault/CredentialBroker (AES-256-GCM) + VaultRef; secrets not returned in API responses.
- [x] Google OAuth PKCE scaffold/connect/callback/revoke; token refresh-on-expiry; revoke hardening.
- [x] Gmail read/send guarded with approval/actionHash/idempotency/uncertain reconcile.
- [x] Google Calendar read/create/update/delete guarded with approval/actionHash/idempotency/uncertain reconcile.
- [x] Web connector management UI; connector account status/test routes.
- [x] OAuth helper tests PASS (5/5); identity policy enforcement wired into Gmail/Calendar/browser external action (flag-aware).
- [x] Real Google OAuth connect/callback/test verified 2026-11-24 (write-scoped Gmail/Calendar accounts). Approval-gated Gmail send + Calendar create E2E PASS with same-idempotency dedupe (same receipt/externalRef); single calendar event confirmed. No auto-delete.
- [x] Guarded Google Calendar create/update/delete API routes with approval/actionHash/idempotency/receipt/identity policy/Temporal routing/uncertain handling/audit (update/delete added 2026-11-25; reconciliation lookup support already present).
- [ ] Real-provider uncertain/timeout reconcile proof beyond API-level cases.
- [ ] Token refresh/revoke hardening against real provider behavior.
- [ ] Richer connector diagnostics/sync UX and broader connector policy matrix.
- [ ] Vault secret storage/deployment hardening for production (KMS/encrypted provider decision).
- [ ] MCP integration policy: allowlist, pinned digest/version, sandbox, trust levels.

## P5 Temporal / Reliability
- [x] ADR-002; shared Temporal config/contracts; `@helm/temporal-worker` scaffold.
- [x] Temporal routing for gmail/calendar/browser external writes behind `HELM_TEMPORAL_ENABLED`; fail-closed 503; internal bypass headers.
- [x] Env-gated proofs PASS: temporal-routing-api (1/1), temporal-e2e (1/1), temporal-side-effect-e2e (1/1), temporal-rollback-e2e (1/1).
- [x] DB-canonical reconciliation service/API/scheduler (lookup-first, no blind retry); reconciliation-api PASS (10/10).
- [x] Temporal reconciliation workflow/activity/schedule bootstrap + fault-injection guards preserving no-blind-retry (`8471aef`, CI `45441229198` green).
- [x] Centralized Temporal external-write action classification + non-retryable error types in shared contracts; workflow uses shared types; shared tests PASS (8 files/28).
- [ ] **Blocked:** Real-provider no-duplicate proof (Google creds/sandbox).
- [ ] Real Temporal server schedule/monitor/fault-injection E2E depth.
- [ ] Retry-policy integration proof by action class; non-retryable classes verified end-to-end (beyond shared classification).
- [ ] Schedules/monitors, dead-letter/operator runbooks, observability depth.

## P6 BrowserOS Deterministic Upgrade
- [x] Adapter boundary + Playwright default + BrowserOS HTTP/stub; status endpoint; dispatch flag.
- [x] External runtime decision: BrowserOS neo MCP endpoint `127.0.0.1:9210/mcp`, external-runtime-only boundary confirmed (AGPL, no code copied).
- [x] MCP adapter/client behind contract (`BROWSEROS_MCP_URL`), capability/report, timeout/error classification; selector-not-found click/fill hardening (`0616ad1`, local unpushed).
- [x] Contract tests PASS (12/12); env-gated smoke PASS (3/3: capabilities/create/navigate/snapshot/close, unknown-session structured error, click/fill selector-not-found structured error; screenshot best-effort).
- [ ] Push `0616ad1`, verify CI green for pushed P6 commits.
- [ ] Positive click/fill success parity on controlled selector, takeover semantics, artifact/error parity depth.
- [~] Security/compliance review baseline recorded (2026-11-25): AGPL boundary/no copied code, Helm route authZ preserved, no adapter secret logging. Remaining: operator URL trust/SSRF guard, external-runtime credential handling, artifact/PII retention review, formal threat-model signoff.
- [ ] Capability fallback/dispatch policy; default dispatch only after parity.
- [ ] Performance benchmarking vs Playwright baseline.

## P7 Memory / Skills / Proactivity
- [x] Identity contracts/routes/policy read+PATCH/binding; restrictive default policy.
- [x] Identity policy enforcement helper wired into Gmail/Calendar/browser external action (flag-aware); identity-policy tests PASS (4/4).
- [x] P7 DB tables applied/verified (17 public tables).
- [x] Memory notes behind `HELM_MEMORY_ENABLED`; skills/proactivity rules behind flags (no autonomous execution).
- [x] Self-improvement design-only (`DESIGN-self-improvement-loop.md`); `selfImprovement.allowed=false`, `requiresExplicitApproval=true`.
- [ ] Identity vault linkage/UI; broader side-effect policy coverage.
- [ ] Skill execution/proactivity scheduler (flag-gated, no unsafe autonomous behavior).
- [ ] Memory provenance/sensitivity/CRUD/export depth.
- [ ] **Blocked (explicit user approval):** self-improvement implementation/activation.

## P8 Hardening / Release
- [x] CI green (lint/typecheck/build/test, report-only dep audit). Latest: `45441229198`.
- [x] Backup/restore scripts; dry-run evidence to temp DB (17 tables verified, temp DB dropped).
- [x] P8 checklists/runbooks: hardening, security/privacy, threat-model baseline, PII retention baseline/notes, release evidence, dependency audit triage.
- [x] Observability redaction expanded; redaction regression PASS (1/1).
- [x] Task export/delete controls with env-gated integration PASS (1/1).
- [ ] Full backup/restore drill with artifacts/vault-key scope, encrypted/retention/scheduled verification. **Blocked:** ops/manual.
- [ ] CI security scan triage/gating decisions. **Blocked:** product/security decision.
- [ ] Threat-model execution/evidence. **Blocked:** manual review.
- [ ] PII retention/export/delete policy + implementation decisions. **Blocked:** product/legal.
- [ ] Compliance/provenance/Dubai submission signoff; organizer promotional-rights/IP text; third-party notices refresh on dep changes. **Blocked:** legal/submission.
- [ ] Chaos/fault matrix, SLO dashboards/alerts, packaging/docs/runbooks/release gates.

## Cross-cutting / Contracts
- [x] Shared Zod contracts in `packages/shared`; vendor SDK isolation boundary.
- [x] Approval/actionHash/idempotency/receipt invariants in guarded external paths.
- [x] Structured Pino redaction baseline.
- [ ] `HelmError` wiring end-to-end; no silent failures; trace fields in all critical paths.
- [ ] Idempotency/audit coverage matrix for every mutating endpoint/tool.
- [ ] ADRs: canonical event schema (AG-UI extension vs custom), secret vault, observability stack, BrowserOS/Obscura external adapter policy.

## 2026-11-25 - Scout consolidation (read-only, 17/17 completed after resume)

**Completed scout evidence (no code claims beyond inspected files/tests):**
- **P0**: tsconfig workaround removed in api/worker/browser-worker; alignment script exists/idempotent. Remaining gaps: fresh-clone/CI confirmation after push; `backend/temporal-worker/tsconfig.json` still has `../../packages/*/src/**/*.ts` include workaround; root `tsconfig.json` omits temporal-worker ref; generated `packages/db/src/*.{js,d.ts,map}` artifacts tracked; CI has no DB/fresh-clone migrate smoke. Blocker: mostly self-doable; push/CI proof external.
- **P1**: SSE route supports `after` + `Last-Event-ID` fallback, malformed Last-Event-ID ignored; env-gated API integration covers cursor/Last-Event-ID/malformed/invalid cases. Gaps: browser-level SSE reconnect E2E, live UI smoke, AG-UI WS `/v1/ws` decision/ADR-004 outcome not recorded, lease heartbeat/fault-injection depth. Blockers: browser automation/env; decision/governance.
- **P2**: HelmNativeRuntime/contract/tool loop/approval gating/model config exist; worker tests narrow. Gaps: interrupt/resume/checkpoint contract+impl, runtime eval harness, real browser+connector E2E, model/provider evidence matrix, run cancellation/lease heartbeat during long runs. Blockers: implementation/evidence; real env for live E2E/provider.
- **P3**: Playwright worker, CDP screencast, WS proxy, takeover, artifacts, guarded routes, restart recovery, env-gated integration tests exist. API WS proxy now forwards client input upstream (2026-11-25). Gaps: live interactive WS/takeover smoke, screenshot/snapshot artifact rows not consistently persisted for evidence API, takeover-state recovery semantics, richer controls/artifacts. Blockers: browser automation/env; implementation gaps.
- **P4**: OAuth PKCE/vault/guarded Gmail send+Calendar create/reconciliation baseline solid. Calendar update/delete guarded API routes added 2026-11-25 (shared schemas/reconcile support already present). Remaining gaps: registry not persisted/lifecycle-managed; vault dev-key fallback/KMS/rotation/revoke-tombstone; refresh/revoke real-provider hardening+proof; uncertain-reconcile real-provider proof; identity policy narrow/flag-gated; diagnostics/sync UX minimal; reconcile logic duplication/evidence audit gaps; test gaps (vault/oauth route/real-provider update-delete). Blockers: self-doable code/tests; real-provider/KMS/ops decisions external.
- **P5**: DB-canonical receipts/idempotency/fail-closed routing/lookup-first reconciliation/schedule hooks exist. Gaps: routing/dedupe integration mostly Gmail-send focused, real Temporal E2E stub/dedupe-heavy not full side-effect semantics, fault injection coarse, ADR signal/query drift, internal Temporal bypass weak when secret unset, schedule workflowId/operator observability gaps. Blockers: self-doable tests/hardening; real Temporal/provider sandbox for deep proof.
- **P6**: Adapter boundary/MCP client-executor/capability/timeout/error mapping/selector hardening present; env-gated smoke 6/6 PASS (2026-11-25 rerun) and adapter contract 19/19 PASS after fixing malformed tail. Gaps: deeper artifact/error parity vs Playwright behavior, BrowserOS takeover semantics under real browser control, artifact download path containment/retention/PII policy, no automatic fallback (by design), formal STRIDE/threat-model/PII retention policy, non-loopback credential technical verification if used. Dispatch policy explicit: Playwright default, no silent fallback/default dispatch, `HELM_BROWSER_ADAPTER_DISPATCH` opt-in only after parity+security+CI evidence. Blockers: real BrowserOS runtime behavior; security/legal/manual evidence.
- **P7**: Identity/memory/skills/proactivity scaffolds and P7 tables exist; self-improvement design-only. Gaps: runtime approval gate incomplete/inconsistent, no self-improvement artifacts/workflow, identity vault linkage/UI/coverage, memory provenance/sensitivity/CRUD/export, skills/proactivity execution/scheduler, migration-history alignment, thin tests. Blockers: **explicit user approval for self-improvement activation**; implementation/evidence.
- **P8**: Backup/restore scripts+DB dry-run, redaction regression, task export/delete scaffold, dep audit report-only CI exist. Gaps: full restore drill (artifacts/vault key/scope/encrypted/scheduled/staging), scan gating/SAST/secrets/container/SBOM, formal STRIDE/threat-model signoff, PII retention/export/delete/legal policy+impl, export redaction/API context sanitization, threat-model/restore-drill evidence docs. Blockers: ops/manual/product/security/legal decisions and evidence.

**Rate-limited scouts resumed:** all 6 completed (`P0/P4/P6/P7/P8 code`, `P4 evidence`).

## 2026-11-25 - P6 BrowserOS MCP smoke rerun (local env-gated)
- Evidence: `pnpm -C backend/api exec tsc -p tsconfig.json --noEmit` PASS; `pnpm -C backend/api exec vitest run src/lib/browser-adapter.test.ts` PASS (17/17); `HELM_BROWSEROS_MCP_SMOKE=1 BROWSEROS_MCP_URL=http://127.0.0.1:9210/mcp BROWSEROS_MCP_SMOKE_URL=https://example.com BROWSEROS_MCP_TIMEOUT_MS=45000 pnpm -C backend/api exec vitest run src/routes/browseros-mcp-smoke.test.ts` PASS (6/6, 224.85s).
- Baseline: `{"capabilities":23,"create":204,"navigate":975,"snapshot":90,"fill":116,"click":267,"takeover_request":1,"takeover_resume":1,"close":75}` ms (controlled local page, baseline-only; no external side effects).
- Policy confirmed: Playwright default; BrowserOS explicit opt-in; no silent fallback/default dispatch; `HELM_BROWSER_ADAPTER_DISPATCH` remains off until parity+security+CI evidence.

## 2026-11-25 - P6 BrowserOS MCP parity depth (local evidence)
- Added env-gated smoke cases: positive click/fill on controlled local page (no external side effects) and adapter-level takeover request/resume/stream-status parity.
- Evidence: `pnpm -C backend/api exec tsc -p tsconfig.json --noEmit` PASS; `browser-adapter.test.ts` 12/12 PASS; env-gated smoke 5/5 PASS (`HELM_BROWSEROS_MCP_SMOKE=1 BROWSEROS_MCP_URL=http://127.0.0.1:9210/mcp BROWSEROS_MCP_SMOKE_URL=https://example.com BROWSEROS_MCP_TIMEOUT_MS=45000`).
- Policy recorded: Playwright default; BrowserOS opt-in explicit; no silent fallback/default dispatch; dispatch-by-default gate requires parity+security+CI evidence.
- Remaining: deeper BrowserOS-vs-Playwright artifact/error/takeover-control parity, security/compliance review, performance baseline, CI for this batch.
