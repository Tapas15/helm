# Helm - Change & Journey Tracker

> **START HERE if you have zero context.**

## Read Order (new session / no context)
1. `CURRENT_STATE.md` - **current project status dashboard** (%, remaining, blockers, invariants, latest completed)
2. `phase-1-ui-task-core.md` ... `phase-8-hardening-release.md` - phase checklists/evidence (active execution detail)
3. `SESSION_LOG.md` - session-by-session history
4. `DECISIONS.md` - decisions/assumptions/ADRs
5. `FIX_LOG.md` - problems/fixes/audit trail
6. `RUNBOOK.md` - commands
7. `archive/` - historical/superseded snapshots (phase-0 foundation, old detailed state)

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

## Phase Index (phase 1-8 active; phase 0 archived)

| Phase | Status | % | Doc | Summary |
|---|---|---:|---|---|
| 0 | `[~]` | 91 | [archive/phase-0-foundation.md](./archive/phase-0-foundation.md) | Historical baseline; migration-history alignment still pending |
| 1 | `[~]` | 91 | [phase-1-ui-task-core.md](./phase-1-ui-task-core.md) | Chat/SSE/controls/preview; live UI E2E and cursor-resume proof pending |
| 2 | `[~]` | 73 | [phase-2-hermes-runtime.md](./phase-2-hermes-runtime.md) | Helm-native runtime/tool policy/model override; live real-flow E2E pending |
| 3 | `[~]` | 93 | [phase-3-browser-execution.md](./phase-3-browser-execution.md) | Playwright/WS preview/takeover/guarded actions; live smoke/richer controls pending |
| 4 | `[~]` | 90 | [phase-4-approvals-vault-connectors.md](./phase-4-approvals-vault-connectors.md) | Vault/Gmail/Calendar guarded+reconcile; real OAuth E2E blocked on creds |
| 5 | `[~]` | 68 | [phase-5-temporal-reliability.md](./phase-5-temporal-reliability.md) | Temporal routing+reconciliation schedule/fault guards; real-provider/real-Temporal depth blocked |
| 6 | `[~]` | 58 | [phase-6-browseros-upgrade.md](./phase-6-browseros-upgrade.md) | MCP adapter/capability/error hardening + env-gated smoke; positive parity/security/fallback/CI pending |
| 7 | `[~]` | 48 | [phase-7-memory-skills-proactivity.md](./phase-7-memory-skills-proactivity.md) | Identity/policy/memory/skills flags; self-improvement activation approval-gated |
| 8 | `[~]` | 43 | [phase-8-hardening-release.md](./phase-8-hardening-release.md) | CI/backup-dry-run/redaction/export-delete; drills/scans/compliance signoff pending |

## Mandatory Update Protocol (no user prompt needed)
After every meaningful work batch, update:
1. `CURRENT_STATE.md` - current %, remaining, blockers, latest completed, where-detail links
2. `SESSION_LOG.md` - append session entry (commands, pass/fail, files, blockers)
3. Active `phase-1`..`phase-8` docs - checklist + evidence
4. `FIX_LOG.md` - any non-trivial fix/incident (regression + audit/safety note)
5. `DECISIONS.md` - decisions/ADRs/assumptions
6. Repo-root `README.md`/`ROADMAP.md` when percentages/progress change
7. This README table/status if changed
Commit docs with code when work is committed.
