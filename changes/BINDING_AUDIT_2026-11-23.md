# Side-Effect Binding Audit - 2026-11-23

## Scope
Mutating API routes and browser side-effect paths in `backend/api/src/routes/*`. Goal: every external/high-risk side effect requires explicit approval + actionHash + idempotency + receipt/audit, or is explicitly classified as low-risk with rationale.

## Route Audit (updated 2026-11-23T08:05:00Z)

| Route | Mutates | Current guard | Risk | Verdict | Evidence / Notes |
|---|---|---|---|---|---|
| POST /v1/tasks | creates task, message, event, audit | user auth; idempotency-key replay by task.state | medium | OK | task create idempotency + audit in `routes/tasks.ts` |
| POST /v1/tasks/:id/messages | appends user message, requeues task, event, audit | user auth; task ownership; 409 if running/planning | medium | OK | ownership check + audit/event |
| POST /v1/tasks/:id/control | state transition, event, audit | user auth; CAS/status transition validation | medium | OK | transition guard in shared control |
| POST /v1/approvals/:id/resolve | approval status, task status, receipt, event, audit | ownership; actionHash mismatch 403; same decision dedupe; conflicting 409; CAS pending update; approved receipt inserted | high | OK | `routes/approvals.ts`; integration `approval-resolve-api` PASS |
| POST /v1/browser/sessions | creates browser session | auth; if taskId provided requires owned task; audit logged | medium | OK | `routes/browser.ts` session create ownership + audit |
| GET /v1/browser/sessions | lists sessions | filtered to user-owned task/session IDs | low/medium | OK | prevents cross-user session metadata leak |
| POST /v1/browser/sessions/:id/navigate | browser navigation | guarded path when approval guard present; low-risk allowlist requires owned session + audit; non-allowlisted requires approval+actionHash+idempotency | high | OK | `browser-navigate-guard-api` PASS (allowlisted 200, non-allowlisted 403, guarded dedupe) |
| POST /v1/browser/sessions/:id/click | browser click side effect | approval+actionHash+idempotency+receipt+audit | high | OK | guardedAct path |
| POST /v1/browser/sessions/:id/fill | browser fill side effect | approval+actionHash+idempotency+receipt+audit | high | OK | guardedAct path; redact sensitive values still pending |
| POST /v1/browser/sessions/:id/screenshot | creates screenshot artifact | requires owned session + audit; low-risk observe | low/medium | OK (policy) | ownership + audit added |
| GET /v1/browser/sessions/:id/screenshot.png | returns screenshot bytes | requires owned session | low/medium | OK | ownership check added |
| POST /v1/browser/sessions/:id/snapshot | DOM snapshot | requires owned session + audit | low/medium | OK (policy) | ownership + audit added |
| POST /v1/browser/sessions/:id/takeover/request | task state waiting_input, event, audit | ownership via task resolve; audit/event | medium | OK | add idempotency/CAS later |
| POST /v1/browser/sessions/:id/takeover/resume | task requeue, event, audit | ownership via task resolve; audit/event | medium | OK | add idempotency/CAS later |
| POST /v1/browser/sessions/:id/external-action | guarded external browser action | approval+actionHash+idempotency+receipt+audit+artifact | high | OK | canonical high-risk path |
| POST /v1/browser/sessions/:id/close | closes browser session | requires owned session + audit | medium | OK | ownership + audit added |
| WS /v1/browser/sessions/:id/stream | live stream proxy | API checks session/task ownership before proxy; accepts x-user-id header dev parity | medium/high | Partial | real auth/session token still pending; WS authz integration test PASS for cross-user denial |

## Remaining Gaps
1. **Real auth/session tokens** - dev `x-user-id` parity remains; replace with real session/auth for API + WS.
2. **GuardedAct session ownership** - guarded click/fill/navigate-guarded/external-action verify approval ownership but should also verify target session is owned by same user/task context.
3. **Rate limits/quotas** - session create, observe endpoints, WS upgrades.
4. **Redaction** - fill/screenshot/snapshot payload redaction and PII logging audit.
5. **Idempotency/CAS hardening** - takeover request/resume, close, task control/message follow-up where appropriate.
6. **Legacy unbound sessions** - deterministic migration/rebind/reject policy for browser sessions without task ownership.

## Regression Tests
- [x] approval resolve: actionHash mismatch 403, replay dedupe, conflicting decision 409 (`approval-resolve-api`).
- [x] browser ownership: cross-user get/snapshot/close denied (`browser-ownership-api`).
- [x] navigate guard: allowlisted 200, non-allowlisted 403, guarded approved navigate dedupe (`browser-navigate-guard-api`).
- [x] WS authz: cross-user stream denied (`browser-ws-authz-api`).
- [ ] guarded click/fill/external-action ownership + receipt conflict matrix.
- [ ] session create task ownership negative test.
- [ ] takeover request/resume idempotency/CAS.

## Status
- Binding audit materially improved; high-risk browser/approval routes guarded. Remaining work is real auth, ownership on guardedAct, rate limits/redaction, and deterministic legacy-session policy.
