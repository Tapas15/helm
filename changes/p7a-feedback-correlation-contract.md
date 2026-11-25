# P7a/P7b Contract-Limited Gaps — Correlation Design (Draft-only)

**Status:** Draft design. No activation/apply. No runtime behavior change required by this doc.
**Date:** 2026-11-25

## Purpose
Document safe, additive correlation contracts needed before emitting user-scoped P7a feedback in currently contract-limited paths.

## 1) Worker loop catch / claim failures

**Current gap:** `backend/worker/src/index.ts` loop catch previously logged without task/user/run correlation. Claim failures happen before a task is claimed, so there is no safe `userId/taskId/runId`.

**What was safely improved now:**
- Split claim vs process error handling.
- Claim errors: log `event=worker.claim.error` with `agentId`; no user-scoped feedback emitted.
- Process unexpected errors: log includes `taskId`, `userId`, `runId=currentStepId` when task object exists. No feedback emitted here because `processTask` already handles expected failure feedback; this is defense-in-depth.

**Remaining contract need (if we want feedback):**
- Additive infra/system feedback channel/table or allow `userId=null` system feedback with strict redaction and operator-only visibility.
- Do **not** fabricate user/task IDs.
- Requires explicit contract decision: system feedback schema, access control, retention, and audit.

## 2) Browser-worker feedback

**Current gap:** `backend/browser-worker/src/index.ts` has no DB access and no task/user/run correlation in many execution paths. It can log request trace IDs, but cannot safely write user-scoped P7a feedback rows.

**Additive contract proposal (no behavior change until wired):**
- Extend browser-worker request/action contracts with optional correlation metadata:
  - `userId?: string`
  - `taskId?: string`
  - `runId?: string | null`
  - `correlationId?: string`
  - `approvalId?: string`
  - `actionHash?: string`
- Accept metadata only from trusted API caller (existing bearer token boundary), never from untrusted web content.
- Browser-worker should return correlation in error payloads/logs; API remains source of truth for DB feedback writes where possible.

**Implemented in this slice (additive, no DB write):**
- `packages/shared/src/browser.ts`: browser action inputs now accept optional correlation fields (`userId`, `taskId`, `runId`, `correlationId`) via `BrowserActionCorrelation`.
- `backend/api/src/routes/browser.ts`: trusted API routes propagate optional correlation fields to browser-worker guarded/low-risk/takeover/external-action payloads.
- `backend/browser-worker/src/index.ts`: action handler parses correlation fields, logs them with request/action outcome (`traceCorrelationId` kept separate from input correlation), and echoes `correlation` in action responses/validation error details. No feedback DB writes, no behavior change.

**Preferred wiring order:**
1. API emits feedback when it has correlation (already done for guardedAct/external-action failures).
2. Add optional correlation fields to browser-worker action inputs/responses.
3. Only after correlation is present and redacted, consider browser-worker->API/DB feedback emission path with explicit contract.

## Safety rules
- No user-scoped feedback without `userId`.
- No secrets/tokens/PII in feedback payloads; keep redaction.
- Flag-gated `HELM_FEEDBACK_ENABLED!=1` means no-op.
- No activation/apply/self-improvement behavior.
- Additive fields only; existing clients remain valid.
