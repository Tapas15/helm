# Planning Missing Items ? Helm

**Last updated:** 2026-11-24T17:30:00Z  
**Status:** Active checklist (cross-check with `CURRENT_STATE.md` and `phase-1`..`phase-8`).  
**Rule:** Mark `[x]` only with evidence (code/test/CI/doc). Keep blocked items visible with blocker reason.

## P0 Foundation / Repo
- [x] Remote CI evidence verified: GitHub Actions `45438392752` PASS, `45441229198` PASS (main).
- [ ] ESLint-depth lint rules (currently `tsc --noEmit` placeholders).
- [ ] `tsconfig` dist/src path workaround cleanup for builds/typechecks.
- [ ] tsx watch stability (known worker/API watch instability).
- [ ] **Blocked/tooling:** CI-safe non-interactive Drizzle migration-history alignment for manual P7 baseline (`packages/db/drizzle/0001_p7_tables_manual.sql`); no destructive reset without explicit approval.

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
- [x] Adapter boundary + Playwright default + BrowserOS HTTP/stub; status endpoint; dispatch flag; contract tests PASS (6/6).
- [ ] **Blocked:** Real BrowserOS endpoint/protocol/token/runtime decision + parity/security tests.
- [ ] Capability detection/fallback; default dispatch only after parity.
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

## 2026-11-24 - P6 BrowserOS MCP adapter (verified slice)
- Added external BrowserOS MCP adapter path (BROWSEROS_MCP_URL, streamable HTTP /mcp) behind existing browser adapter contract; Playwright default unchanged. User confirmed external-adapter OK; no BrowserOS code copied.
- Evidence: API typecheck PASS; rowser-adapter.test.ts 7/7 PASS; env-gated MCP smoke PASS (create/screenshot/snapshot/close on https://example.com).
- Still missing for P6: full action parity (click/fill/selector/takeover/error semantics), security/compliance review, capability detection/fallback, default-dispatch decision, CI/fresh evidence.
