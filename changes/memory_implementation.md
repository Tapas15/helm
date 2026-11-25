# Helm Memory Systems — How Each One Works

This document explains each Helm memory/learning system in simple steps: how much is implemented, how it works, what it does now, and what it does not do yet.

---

## P7a — Feedback + Eval Memory

**How much implemented:** ~75%

### What this memory is for
P7a remembers what went well or badly. It stores feedback from real events so Helm can learn from mistakes, create eval/regression cases, and draft improvement ideas. It does **not** change behavior by itself.

### How it works (steps)
1. **Something happens**
   - An approval decision, connector action, reconciliation result, worker task completion, or worker runtime crash happens.

2. **Check if feedback is on**
   - If `HELM_FEEDBACK_ENABLED!=1`, feedback emission is a no-op (nothing stored, main behavior continues).

3. **Build a safe feedback record**
   - Helm creates a feedback event with:
     - `kind`: `task_outcome`, `approval_decision`, `tool_failure`, `user_correction`, `model_quality`, or `eval_result`
     - `signal`: `positive`, `negative`, or `neutral`
     - `severity`: `info`, `warn`, or `error`
     - redacted payload and evidence refs

4. **Redact sensitive data**
   - Sensitive keys/values (tokens, secrets, passwords, auth/cookie/api key/private key/vault-like data) are replaced with `[REDACTED]` before storing.

5. **Store the feedback event**
   - The event is saved in `feedback_events`.
   - If insert fails, helper is no-throw where used; feedback must not break the main flow.

6. **Turn feedback into an eval case (optional)**
   - API can create a draft eval case from a feedback event.
   - Eval case stores redacted input/expected data and status `draft`.

7. **Turn feedback/eval into a draft proposal (optional)**
   - If `HELM_FEEDBACK_PROPOSALS_ENABLED=1`, API can create a draft self-improvement proposal from feedback/eval.
   - Proposal is always `status=draft`, `activation=blocked`, `requiresApproval=true`.

8. **Review only - no activation**
   - Humans can list/read/patch draft proposals safely.
   - No apply/activation route exists. Feedback does not auto-change runtime behavior.

### What it does now
- Stores feedback events and eval cases (flag-gated).
- Emits feedback for: approval decisions; Gmail send failures/uncertain outcomes; Calendar create/update/delete failures/uncertain outcomes; reconciliation resolved outcomes; worker task completion and worker runtime crash.
- Redacts sensitive data in feedback payload/evidence.
- Creates draft eval cases from feedback events.
- Creates/reads/lists/patches draft-only proposals with audit events.

### What it does not do yet
- **Worker loop catch gap**: catch path has no `userId/taskId/runId`, so it cannot safely emit user-scoped feedback without a contract change.
- **Browser-worker gap**: browser-worker has no DB/feedback/task-run correlation; needs cross-service contract/DB wiring decision.
- **No autonomous learning**: feedback cannot change prompts/policy/routing/skills by itself.
- **No full eval gate loop**: broader automated eval scoring/gating is not complete.

---

## P7b — Long-term Memory Notes

**How much implemented:** ~92%

### What this memory is for
P7b is Helm’s notebook for important user/task facts. It remembers useful notes, not every chat message. It is designed to be safe, user-scoped, and user-controlled.

### How it works (steps)
1. **Memory request comes in**
   - A memory API request is made: status, list, get, create, patch, export, delete, recent audit, or retention dry-run.

2. **Check if memory is on**
   - If `HELM_MEMORY_ENABLED!=1`, memory data routes are blocked/forbidden.
   - Status reports whether memory is enabled/disabled.

3. **Check user scope**
   - Helm reads `userId` from auth.
   - Every note read/write/delete/export/audit query is scoped to that user only.

4. **Validate and normalize input**
   - Create requires non-empty `content`.
   - Helm normalizes fields like `kind`, `identityId`, `provenance`, `confidence`, `confirmed`, `retentionPolicy`, `expiresAt`, and `pii`.

5. **Label where the note came from (provenance)**
   - `user_confirmed`: user clearly confirmed it.
   - `observed`: Helm observed it from allowed context.
   - `inferred`: Helm guessed it.

6. **Block unsafe guessed notes**
   - If provenance is `inferred`, the note is rejected unless `confirmed=true` or `HELM_MEMORY_ALLOW_INFERRED=1`.

7. **Redact sensitive content before saving**
   - Secret-like data (API keys, tokens, passwords, bearer/private key/vault-like values) is redacted.
   - PII-like data (email/card/SSN/phone/address patterns) is redacted.
   - Redacted content becomes `[REDACTED_SENSITIVE_MEMORY]` and metadata marks sensitivity/PII/redaction.

8. **Save note in DB with metadata**
   - Helm stores the note in `memory_notes`.
   - Metadata includes provenance, confidence (clamped 0..1, inferred capped), sensitivity, PII flag, retention metadata, confirmed flag, source, and version.
   - Patch/update re-redacts changed content and increments `version`.

9. **Use memory at runtime (bounded)**
   - When memory is enabled, worker loads a bounded set of recent enabled notes into runtime context.
   - It emits `runtime.memory.loaded`.
   - It does **not** load the whole memory DB into context.

10. **Give user control**
   - User can list notes, search with `q`, filter by `provenance`, get one note, export notes, patch notes, and delete notes.

11. **Write/read memory audit (best-effort)**
   - Memory actions can write `memory_note` audit log entries.
   - Audit failure must not change memory behavior.
   - User can read recent memory audit events through read-only endpoint.

12. **Retention dry-run only (no delete)**
   - If `HELM_MEMORY_RETENTION_DRY_RUN=1`, retention dry-run scans notes and reports candidates based on retention metadata (`retentionPolicy`, `expiresAt`).
   - Response includes `deleted: 0` and dry-run note.
   - No memory row is deleted.

### What it does now
- Flag-gated, user-scoped memory note CRUD/export/search/filter.
- Provenance labels and inferred-memory gate.
- Secret and PII redaction before save.
- Confidence/version/sensitivity/retention/PII metadata.
- Read-only recent memory audit.
- Flag-gated bounded lexical retrieval (`GET /v1/memory/retrieval`) with deterministic `semantic-hash-fallback` behind explicit semantic flag; optional embedding provider seam is fail-closed (no default provider wiring, unknown selection -> hash fallback, provider failure -> lexical). Status exposes retrieval/semantic/embedding selection/injected flags.
- Consolidation dry-run (`GET /v1/memory/consolidation/dry-run`) is report-only with merge-preview metadata (`applied=false`, `deleted:0`, `modified:0`); no apply endpoint (contract-tested 404/405).
- Retention dry-run report with no deletion.
- Bounded runtime memory loading in worker.

### What it does not do yet
- **No auto-delete/retention enforcement**: dry-run/report only. Needs explicit approval before any enforcement.
- **No full PII/legal/compliance signoff**: broader PII taxonomy and legal/privacy signoff still needed.
- **No semantic retrieval/consolidation**: no finished “remember weeks/months ago” semantic memory/consolidation flow; runtime uses bounded recent notes.
- **No automatic full-chat capture**: does not save every chat message automatically.

---

## P7c — Skill/Playbook Proposal Memory (Draft-only)

**How much implemented:** ~35% (draft-only)

### What this memory is for
P7c remembers improvement ideas as drafts. It can turn feedback/eval signals into a proposal record, but it cannot activate or apply changes.

### How it works (steps)
1. **Feedback or eval exists**
   - A feedback event or eval case gives evidence that something could be improved.

2. **Check flags**
   - `HELM_FEEDBACK_ENABLED=1` and `HELM_FEEDBACK_PROPOSALS_ENABLED=1` are required for proposal routes.

3. **Create a draft proposal**
   - API creates a row in `self_improvement_proposals`.
   - Proposal includes source links (`sourceFeedbackId` / `sourceEvalCaseId`), title/summary/kind/risk, redacted payload, and redacted evidence refs.

4. **Force safe defaults**
   - Proposal is always created as:
     - `status = "draft"`
     - `activation = "blocked"`
     - `requiresApproval = true`

5. **Allow safe draft edits only**
   - PATCH can update safe fields like title/summary/risk/kind/payload/evidence refs.
   - PATCH rejects attempts to move status out of draft, unblock activation, or set `requiresApproval=false`.

6. **Write audit events (best-effort)**
   - Draft create/update writes audit events like `proposal.draft.created` and `proposal.draft.updated`.
   - Audit failure must not change proposal behavior.

7. **Stop before activation**
   - There is no apply route.
   - There is no activation route.
   - No skill/playbook/proactive behavior is executed from proposals.

### What it does now
- Draft-only proposal create/list/get/patch.
- Source linking to feedback/eval.
- Redacted payload/evidence.
- Audit events for draft create/update.
- Hard safety gate: draft + blocked + requiresApproval.

### What it does not do yet
- **No eval-gate/review completion**: richer review/eval-gate metadata and workflow not finished.
- **No apply/activation**: blocked until explicit user approval.
- **No autonomous execution**: cannot turn on skills, playbooks, or self-improvements.

---

## P7d — Bounded Auto-tuning Memory (Blocked)

**How much implemented:** ~0% (design/gate only)

### What this memory is for
P7d would be for small, carefully controlled self-tuning (like prompt/routing tweaks) using evidence, evals, and rollback. It is the highest-risk memory/learning area.

### How it works now (current state)
1. **Blocked by default**
   - There is no P7d auto-tuning runtime implementation.

2. **No activation path**
   - Helm cannot auto-tune prompts/routing/policy/security/identity.
   - No silent activation is allowed.

3. **Approval gate required**
   - Any future P7d work needs explicit written user approval before activation/apply.

### How it should work only after explicit approval
1. **Get explicit written approval**
   - Approval must define allowed scope, required gates, and forbidden scope.

2. **Propose a small bounded change**
   - Only low-risk, approved tuning scope; no policy/security/identity self-modification.

3. **Run required gates**
   - Eval pass, human review, rollback/versioning, audit trail, redaction, kill switch.

4. **Canary and observe**
   - Small rollout first; monitor for regressions.

5. **Rollback or keep**
   - If bad, rollback quickly. If good, keep with audit/version record.

### What it does now
- Design/gate awareness only.
- Explicitly blocked.

### What it does not do yet
- Everything related to auto-tuning execution: proposal-to-apply path, eval-gated activation, canary, auto-rollback, runtime tuning.

---

## Simple approval boundaries

## Contracts / evidence
- Memory status/retrieval/consolidation/retention contract: `changes/p7b-memory-status-contract.md`
- Retention/PII policy scaffold: `changes/p7b-retention-pii-policy.md`

- **P7c/P7d activation/apply/auto-run/autonomous self-improvement**: needs your explicit written “yes” with allowed scope, required gates, and forbidden changes.
- **P7b retention enforcement/delete**: needs your explicit “yes”, accepted dry-run report, audit evidence, retention windows, privacy/legal signoff; vault secrets never deleted.
- **Skills/proactivity execution**: needs your explicit “yes” with allowed actions, approval/idempotency/audit/receipt, rate limits, and kill switch.