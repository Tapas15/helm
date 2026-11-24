# Continuation Chunk ? Helm

**Use this as the resume context for a new session.**  
**Last updated:** 2026-11-24T17:30:00Z  
**Repo:** `C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\helm` (branch `main`, remote `Tapas15/helm`)

## Read first
- `changes/CURRENT_STATE.md` ? current status dashboard (%, remaining, blockers, invariants, latest completed).
- `changes/phase-1-ui-task-core.md` ... `changes/phase-8-hardening-release.md` ? active phase checklists/evidence.
- `changes/SESSION_LOG.md` ? recent session details.
- `changes/FIX_LOG.md` ? non-trivial fixes/regressions.
- `changes/DECISIONS.md` ? binding decisions.

## Current state (high signal)
- **Overall 70.0%** (equal-weight P0-P8): P0 91, P1 91, P2 73, P3 93, P4 90, P5 68, P6 34, P7 48, P8 43. Remaining 30.0%.
- **CI:** green `45441229198` (main, 2026-11-24).
- **Done:** chat-first UI/SSE/approvals/evidence/receipts/preview/takeover; HelmNativeRuntime + local Ollama + tool policy/approval gating/model override; Playwright browser-worker with guarded actions/recovery; vault/OAuth PKCE scaffold + Gmail/Calendar guarded+reconcile; Temporal routing/fail-closed + DB-canonical reconciliation/scheduler + Temporal schedule/fault-injection guards; BrowserOS adapter boundary/contract tests; identity/policy/memory/skills/proactivity flags; backup-dry-run/redaction/task export-delete/checklists.
- **Infra:** Docker `infra-postgres-1`, `infra-redis-1`; dev web `5173`, API `8787`, browser-worker `8790`; do not touch local PG17 panic.

## Critical invariants
- DB task/event/receipt tables canonical. No blind retry of uncertain external writes; lookup-first only; proven requires provider proof.
- External/browser side effects require approved `approvalId` + matching `actionHash` + idempotency receipt; dedupe same receipt; executing claim 409.
- No secrets in logs/events/prompts. Vendor SDKs behind `packages/shared` contracts/adapters.
- Self-improvement design-only; explicit user approval required before implementation/activation.
- No CopilotKit/`@ag-ui/*`. No Hermes/BrowserOS/OpenFUSE/NanoClaw/nanoMuse/Composio code copied.

## Next actions (in order)
1. **P5 depth (unblocked where possible):** run env-gated `temporal-reconciliation-e2e` when Temporal env available; extend real Temporal schedule/monitor/fault-injection E2E depth.
2. **P0 tooling:** CI-safe non-interactive Drizzle migration-history alignment for manual P7 baseline; no destructive reset without explicit approval.
3. **P4/P5 real-provider proofs:** real Google OAuth E2E/no-duplicate proof (blocked on `GOOGLE_CLIENT_ID/SECRET`, redirect URI, test accounts).
4. **P6:** real BrowserOS endpoint/protocol/token/parity/security (blocked on runtime decision/endpoint).
5. **P8:** full backup/restore drill (artifacts/vault-key scope), scan gating, threat model, PII/compliance/Dubai signoff (ops/legal/manual).

## Blockers
- Real Google OAuth creds/test accounts.
- Real BrowserOS runtime/endpoint/protocol/token.
- Real Temporal server + provider sandbox for deep proof.
- Drizzle migration-history alignment: TTY/CLI issue; CI-safe non-destructive path needed.
- P8 ops/legal/manual evidence and decisions.
- Self-improvement activation requires explicit user approval.

## Verification commands
```powershell
cd C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\helm
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

## Mandatory update rule
After every meaningful work batch: update `CURRENT_STATE.md`, append `SESSION_LOG.md`, update relevant `phase-1`..`phase-8`, add `FIX_LOG.md` for non-trivial fixes, sync root `README.md`/`ROADMAP.md` when progress changes. No user prompt needed.
