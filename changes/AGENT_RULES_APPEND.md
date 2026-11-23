# AGENTS.md additions (append to root AGENTS.md conceptually; keep this file in sync)

## Observability / Debug / Fix Audit (mandatory)
- Use structured Pino logger; no raw `console.log` in production paths. Dev debug/trace must be flag-gated (`LOG_LEVEL`, `HELM_DEBUG`, `HELM_TRACE_AGENT`).
- Include trace fields where applicable: requestId, correlationId, taskId, runId, stepId, sessionId, userId, agentId, tool.
- Errors use stable `HelmError` code/message/retryable/cause/context(redacted). No silent failures.
- Agent actions emit trace events: proposed/started/completed/failed/diagnosed/fix-applied/fix-verified.
- Every non-trivial fix: add regression test if possible, record in `changes/FIX_LOG.md`, include evidence and verification commands.
- High-risk fixes/changes require explicit approval; agent fixes must be audit-labeled.

## Replaceability
- Contracts in `packages/shared`; adapters isolate vendor SDKs.
- Technology swaps require ADR, migration, rollback, verification.
## User-directive precedence (binding)

- **Do not silently reinterpret or overwrite user-stated decisions.** If new planning/blueprint content conflicts with what the user explicitly told you in conversation, record the conflict in `changes/` and ask the user before making major changes.
- **Conversation directives override inferred plan order.** The user can reprioritize (e.g., local Ollama, self-improvement design, live smoke first) even when blueprint suggests different sequencing.
- **Before major changes**, confirm when there is ambiguity/conflict: architecture, security/policy gates, data model/schema, dependency/license risk, external side effects, or scope expansion.
- **Track explicit user requests** in `SESSION_LOG.md`/`CURRENT_STATE.md` as "User directive" with date; do not mark them done without evidence.
