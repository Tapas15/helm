# Helm - Change & Journey Tracker

> **START HERE if you have zero context.**

## Read Order (new session / no context)
1. `STATUS.md` - **one-page memory dashboard** (%, remaining, blockers, invariants, latest completed)
2. `CURRENT_STATE.md` - authoritative snapshot + context memory + update protocol
3. `SESSION_LOG.md` - latest entries at bottom (append each session)
4. `DECISIONS.md` - decisions/assumptions/ADRs
5. `REPLACEABILITY_OBSERVABILITY_AUDIT_PLAN.md` - cross-cutting requirements (must follow)
6. `FIX_LOG.md` - problems/fixes/audit trail
7. Active phase doc from table below
8. `RUNBOOK.md` - commands

## Project Identity
- **Helm** = personal AI operating assistant platform we are building from scratch.
- **Not Hermes**. Hermes is an external runtime integrated later behind `AgentRuntime` adapter.
- Helm owns UI, control plane, task state, policy/approvals, secrets, audit, execution, connectors, memory, reliability.
- Blueprint source of truth: `../../Personal_assistant/Planning/MASTER-TECHNICAL-BLUEPRINT.md`

## Non-Negotiables (always)
- UI not intelligence; control plane authoritative.
- Model proposes, policy decides.
- Durable state over transcripts.
- Idempotent external effects + receipts; no blind retry on uncertain writes.
- No secrets in logs/events/prompts/memory.
- Replaceable adapters; contracts in `packages/shared`.
- No silent failures; structured errors + agent trace + audit.

## Phase Index

| Phase | Status | Doc | Summary |
|---|---|---|---|
| 0 | `[~]` | [phase-0-foundation.md](./phase-0-foundation.md) | Scaffold+deps+typecheck+build+smoke pass; hardening/CI/bootstrap pending |
| 1 | `[ ]` | [phase-1-ui-task-core.md](./phase-1-ui-task-core.md) | WS event stream, AG-UI reducer, task core hardening |
| 2 | `[ ]` | [phase-2-hermes-runtime.md](./phase-2-hermes-runtime.md) | Hermes adapter, model router, normalized events |
| 3 | `[ ]` | [phase-3-browser-execution.md](./phase-3-browser-execution.md) | Playwright worker, preview, takeover, playbooks |
| 4 | `[ ]` | [phase-4-approvals-vault-connectors.md](./phase-4-approvals-vault-connectors.md) | Sentinel policy, approvals, vault, connectors |
| 5 | `[ ]` | [phase-5-temporal-reliability.md](./phase-5-temporal-reliability.md) | Temporal, idempotency receipts, reconciliation |
| 6 | `[ ]` | [phase-6-browseros-upgrade.md](./phase-6-browseros-upgrade.md) | BrowserOS adapter + fallback |
| 7 | `[ ]` | [phase-7-memory-skills-proactivity.md](./phase-7-memory-skills-proactivity.md) | Memory, skills, monitors, notifications |
| 8 | `[ ]` | [phase-8-hardening-release.md](./phase-8-hardening-release.md) | Security, evals, SLOs, packaging, release gates |

## Mandatory Update Protocol (no user prompt needed)
After every meaningful work batch, update:
1. `STATUS.md` - one-page %, remaining, blockers, latest completed
2. `CURRENT_STATE.md` - snapshot, context memory, next move, evidence
3. `SESSION_LOG.md` - append session entry (commands, pass/fail, files, blockers)
4. Active `phase-*.md` - checklist + evidence
5. `FIX_LOG.md` - any non-trivial fix/incident (regression + audit/safety note)
6. `DECISIONS.md` - decisions/ADRs/assumptions
7. Repo-root `README.md`/`ROADMAP.md` when percentages/progress change
8. This README table/status if changed
Commit docs with code when work is committed.
