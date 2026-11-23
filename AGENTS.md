# Helm — Agent Instructions

> This file applies to any AI coding agent working in this repo. Read `changes/README.md` and `changes/CURRENT_STATE.md` first.

## Project Identity
- **Helm** is an original personal AI operating assistant platform built from scratch for the Dubai competition.
- **No third-party proprietary source copying.** Helm implements similar/better capabilities with original code. Do not copy code from BrowserOS, Hermes, Obscura, or other projects.
- **External runtimes/adapters only by contract.** Hermes/BrowserOS/Obscura-like capabilities may be integrated only as optional external adapters/services behind Helm contracts, with license/compliance review and no vendored AGPL/copyleft code.
- **Blueprint source of truth**: `../Personal_assistant/Planning/MASTER-TECHNICAL-BLUEPRINT.md` and `00-13` planning docs.

## Non-Negotiable Invariants
1. **UI is not intelligence.** Control plane is authoritative.
2. **Model proposes, policy decides.** No unapproved high-risk external action.
3. **Durable state over chat transcripts.** Persist tasks/events/approvals/receipts/checkpoints.
4. **Idempotent external effects.** External writes need idempotency keys + receipts; uncertain outcomes reconciled, never blind-retried.
5. **No secrets in logs/events/prompts/memory.** Redact tokens, keys, passwords, cookies, auth headers.
6. **Inspectable/auditable.** Sensitive actions emit audit records with correlation IDs.
7. **Replaceable adapters.** Model/browser/connector/sandbox/queue behind contracts.

## Workflow Discipline (from everything-claude-code, adapted)
- **Plan before complex work.** Use blueprint phase docs; update `changes/` tracker.
- **TDD where practical.** Write/extend tests for state machines, policy, idempotency, reducers, contracts. Target 80%+ on critical logic.
- **Review before done.** Check security, secret leakage, state transitions, error handling, idempotency.
- **Small verified slices.** Implement one vertical slice, verify, record evidence, then continue.
- **No silent failures.** Every run ends in known state; errors include stable code/message/retryable.

## Coding Style
- **Immutability first.** Never mutate input objects/arrays; return new values.
- **Many small focused files.** Typical 200-400 lines, 800 max. Organize by feature/domain.
- **Explicit types/schemas at boundaries.** Zod at API/tool/event boundaries; infer TS types; avoid `any` in core contracts.
- **Errors are structured.** `{ error: { code, message, retryable, details? } }`; stable error codes.
- **Validate all external input.** API payloads, tool args, webhook/event payloads, env vars.
- **No console.log in production paths.** Use Pino structured logger with redaction.
- **No hardcoded secrets.** Use env/vault refs; `.env.example` has placeholders only.

## Security Checklist (before commit/merge)
- [ ] No hardcoded secrets/API keys/passwords/tokens
- [ ] Input validated (Zod/schema)
- [ ] No secret/PII leakage in logs, events, errors, or UI payloads
- [ ] AuthZ/owner scoping enforced on data access
- [ ] External writes policy-gated; high-risk actions approval-bound
- [ ] Idempotency key/receipt for external side effects
- [ ] SSRF/private-network protections for URL-fetching tools (when implemented)
- [ ] Dependencies reviewed for obvious risk

## Testing Requirements
- **Unit**: state machine, policy, hash/binding, reducers, schema validation.
- **Contract**: Hermes/model/browser/connector adapters.
- **Integration**: API+DB+worker; Testcontainers/docker compose.
- **E2E**: golden paths (create task, live updates, approval, takeover, recovery).
- **Reliability/chaos**: crash/restart/replay must not duplicate external side effects.
- **Security**: prompt injection, approval bypass, SSRF, secret redaction.

## Git / Change Hygiene
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Do not commit real secrets or `.env` with real values.
- Update `changes/CURRENT_STATE.md`, `changes/SESSION_LOG.md`, and active phase file after meaningful work.
- Record commands run and pass/fail evidence.

## Session Start (zero context)
1. Read `changes/README.md`
2. Read `changes/CURRENT_STATE.md`
3. Read latest `changes/SESSION_LOG.md` entry
4. Read active phase doc
5. Confirm next move before making large changes


## Observability / Debug / Fix Audit (mandatory)
- Use structured Pino logger; no raw console.log in production paths. Dev debug/trace must be flag-gated (LOG_LEVEL, HELM_DEBUG, HELM_TRACE_AGENT).
- Include trace fields where applicable: requestId, correlationId, taskId, runId, stepId, sessionId, userId, agentId, tool.
- Errors use stable HelmError code/message/retryable/cause/context(redacted). No silent failures.
- Agent actions emit trace events: proposed/started/completed/failed/diagnosed/fix-applied/fix-verified.
- Every non-trivial fix: add regression test if possible, record in changes/FIX_LOG.md, include evidence and verification commands.
- High-risk fixes/changes require explicit approval; agent fixes must be audit-labeled.

## Replaceability
- Contracts in packages/shared; adapters isolate vendor SDKs.
- Technology swaps require ADR, migration, rollback, verification.
