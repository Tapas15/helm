# Side-Effect Binding Audit - 2026-11-23

## Scope
Mutating API routes (POST/PUT/PATCH/DELETE) in ackend/api/src/routes/*. Goal: every external/high-risk side effect requires explicit approval + actionHash + idempotency + receipt/audit, or is explicitly classified as low-risk with rationale.

## Route Audit

| Route | Mutates | Current guard | Risk | Verdict | Action |
|---|---|---|---|---|---|
| POST /v1/tasks | creates task, message, event, audit | user auth; idempotency-key replay by task.state | medium (state write) | OK | keep; add schema/rate limits later |
| POST /v1/tasks/:id/messages | appends user message, requeues task, event, audit | user auth; task ownership; 409 if running/planning | medium | OK | consider idempotency key |
| POST /v1/tasks/:id/control | state transition, event, audit | CAS by status; transition validation | medium | OK | add idempotency/lease checks as needed |
| POST /v1/approvals/:id/resolve | approval status, task status, event, audit | ownership; only pending; hash not changed (resolved record) | high | **Needs tighten** | require decision binds to expected actionHash? add idempotency key/replay, audit old/new, prevent replay races |
| POST /v1/browser/sessions | creates browser session | auth only; no approval | medium/high depending use | **Needs policy** | classify as allowed internal resource creation; bind to task/user quotas; audit |
| POST /v1/browser/sessions/:id/navigate | browser navigation (can trigger external effects) | schema validation only | high | **Gap** | policy-gate by domain/risk; at minimum audit+task binding; consider approval for unknown/high-risk domains or side-effecting nav |
| POST /v1/browser/sessions/:id/click | browser click side effect | approval+actionHash+idempotency+receipt+audit | high | OK | keep; add URL/domain evidence |
| POST /v1/browser/sessions/:id/fill | browser fill side effect | approval+actionHash+idempotency+receipt+audit | high | OK | keep; redact sensitive values |
| POST /v1/browser/sessions/:id/screenshot | creates screenshot artifact | schema validation only | low/medium | **Needs policy** | classify low-risk observe; ensure ownership/task binding, rate limit, audit optional |
| POST /v1/browser/sessions/:id/snapshot | DOM snapshot | none beyond proxy | low/medium | **Needs policy** | classify low-risk observe; add validation/ownership/rate limit |
| POST /v1/browser/sessions/:id/takeover/request | task state waiting_input, event, audit | ownership via task resolve | medium | OK | add idempotency and stronger task/session binding proof |
| POST /v1/browser/sessions/:id/takeover/resume | task requeue, event, audit | ownership via task resolve | medium | OK | add idempotency/CAS |
| POST /v1/browser/sessions/:id/external-action | guarded external browser action | approval+actionHash+idempotency+receipt+audit+artifact | high | OK | keep as canonical high-risk path |
| POST /v1/browser/sessions/:id/close | closes browser session | auth only | medium | **Needs policy** | require ownership/task binding; audit; idempotent close |

## Immediate Fix Candidates
1. **Navigate risk policy** - 
avigate can cause side effects (logout, form submit, consent, purchase flow start). Add guard mode: low-risk allowlisted domains/read-only ok, else require approval+actionHash+idempotency.
2. **Approval resolve hardening** - require client-supplied ctionHash or expectedStatus check; idempotent replay for same decision; reject if approval already resolved differently; emit receipt lifecycle consistently.
3. **Session create/close ownership audit** - enforce task/user ownership, emit audit events, rate limit.
4. **Observe endpoints** - screenshot/snapshot: enforce session ownership and bind to task where possible; redact/log carefully.

## Required Regression Tests
- click/fill/external-action: missing guard -> 400, wrong actionHash -> 403, wrong approval status -> 403, idempotency reuse different action -> 409, same key executed -> 200 deduped.
- navigate: blocked/guarded when policy requires approval.
- approval resolve: cannot resolve twice with conflicting decision; same decision replay is idempotent.
- close/screenshot/snapshot: cannot access another user's session/task.

## Status
- Audit doc created; implementation pending.
