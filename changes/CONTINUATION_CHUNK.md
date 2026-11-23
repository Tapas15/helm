# Continuation Chunk — Helm

**Use this as the resume context for a new session.**  
**Last updated:** 2026-11-23  
**Repo:** `C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\helm` (branch `main`, remote `Tapas15/helm`)

## Objective
Build Helm (`@helm/*`) as an original personal AI operating assistant (blueprint Phases 0-8) with replaceable contracts/adapters, observability/fix-audit, and approval+idempotency-gated side effects. Current focus: working personal-agent concept (model-backed chat, browser control, approvals/evidence) while closing binding-audit gaps, regression coverage, session-recovery/authz hardening, and live smoke gaps.

## Read first
- `changes/CURRENT_STATE.md` - status, % complete, active/blocked.
- `changes/SESSION_LOG.md` - recent session details.
- `changes/DECISIONS.md` - binding decisions.
- `changes/BINDING_AUDIT_2026-11-23.md` - high-risk browser/approval gaps.
- `changes/BLUEPRINT_GAP_ANALYSIS_2026-11-23.md` - blueprint parity gaps.
- `changes/DESIGN-self-improvement-loop.md` - proposed Helm-owned self-improvement design (not implemented).
- `Planning/MASTER-TECHNICAL-BLUEPRINT.md` and `Planning/00-13` as needed.

## Current state (high signal)
- **~65% overall** (P0 90, P1 87, P2 56, P3 75, P4 47, P5-8 0-5).
- **Works:** chat-first UI with streaming deltas/follow-up; task SSE; approvals/evidence/receipts; browser preview WS + polling fallback, takeover-only remote input; Playwright browser-worker with session metadata/storageState restore; guarded click/fill/external-action and navigate allowlist-or-guard; approval resolve hardened (ownership/actionHash dedupe/conflict/CAS/approved receipt); basic Ollama tool-calling loop (`browser_navigate/snapshot/click`) with `llama3.2:latest` smoke PASS; simple E2E task `task_d7bde8de3cad46d28b5b2d5604d4ee55` PASS.
- **Infra:** Docker `infra-postgres-1`, `infra-redis-1`; web `5174`, API `8787`, browser-worker `8790`; do not touch local PG17 panic.

## Critical invariants
- Helm original; no Hermes/BrowserOS/OpenFUSE/NanoClaw/nanoMuse code copied. nanoMuse GPL - concepts only.
- Model proposes, policy decides; UI not intelligence; durable state; idempotent external effects + receipts; no secrets in logs/events/prompts.
- External/browser side effects require approved `approvalId` + matching `actionHash` + idempotency receipt; key `task:{taskId}:action:{actionHash}`.
- Non-trivial fixes: `changes/FIX_LOG.md` + regression test + audit metadata.

## Next actions (in order)
1. **Live UI E2E smoke with Ollama**: run web/API/worker/browser-worker; send assistant task and browser task requiring approval; verify messages/stream/tool cards/approval/receipt/evidence/browser panels.
2. **Binding-audit regression tests**: navigate guard (403 non-allowlisted without guard, 200 allowlisted, guarded dedupe/conflict); approval resolve replay/conflict/actionHash mismatch; session ownership/audit for screenshot/snapshot/close/create; WS authz/ownership hardening.
3. **Browser recovery hardening**: crash/reconnect/WS stability, interactive takeover live smoke, deterministic recreate/reconnect contract.
4. **Runtime personal-agent loop**: tool-capable model policy/guardrails, richer tool registry/policy, full browser-tool E2E with approvals, persona/memory/provider-model selection UI, proper thread/conversation abstraction.
5. **Blueprint P4/P5**: vault/broker, OAuth connector registry, Gmail/Calendar, uncertain-outcome reconciliation; Temporal workflows/signals/reconcile/schedules.

## Known gaps / blockers
- Self-improvement design doc exists but is **not implemented**; see `DESIGN-self-improvement-loop.md`.
- `pnpm --filter @helm/db db:push` fails in non-TTY; manual psql used for schema changes.
- Full browser-tool E2E with approvals and WS interactive takeover live smoke pending.
- GitHub Actions remote CI evidence not verified.
- Local PG17 panic unresolved - do not use.

## Verification commands
```powershell
cd C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\helm
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @helm/integration-tests test -- browser-external-action
pnpm --filter @helm/worker test -- runtime
```

## User directives (binding, 2026-11-23)
- **Local-first model execution:** Use local Ollama (already installed); no external API key needed. Add model/tool guardrails, pick strongest local tool-capable model, run browser-tool E2E smoke with approvals. Only ask user if they want a specific hosted model/API key or if all local models prove unreliable for tool calls.
- **Self-improvement requested:** Hermes-like self-improvement functionality requested; design captured in `changes/DESIGN-self-improvement-loop.md` (not implemented; needs approval/slicing before implementation).
- **Planning/doc hygiene:** If planning/blueprint conflicts with explicit user conversation directives, do not silently change; record conflict in `changes/` and ask before major changes. Keep continuation/summary chunks in `changes/`.
- **Do not touch local PG17 panic service**.
