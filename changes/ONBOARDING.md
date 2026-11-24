# Helm — First-Time Onboarding (Read This)

> This document is the complete, zero-context guide to Helm as it exists in this repo today.  
> **Last updated:** 2026-11-22T23:15:00Z  
> **Status:** ~38% overall (usable prototype baseline)

## 1. What Helm Is

**Helm** (`@helm/*`) is an original personal AI operating assistant platform being built from scratch for the Dubai competition.

It is **not** Hermes. It is **not** a copy of BrowserOS, Obscura, OpenFUSE, or any other project. Helm may implement similar capabilities with original code and may integrate external runtimes only behind explicit contracts/adapters, with license/compliance review.

**Blueprint source of truth:** `../Personal_assistant/Planning/MASTER-TECHNICAL-BLUEPRINT.md` and `../Personal_assistant/Planning/00-README.md` through `13-Repo-Structure-and-Stack.md`.

## 2. Core Invariants (Non-Negotiable)

1. **UI is not intelligence.** The control plane is authoritative.
2. **Model proposes, policy decides.** No unapproved high-risk external action.
3. **Durable state over chat transcripts.** Tasks/events/approvals/receipts/checkpoints persist in DB.
4. **Idempotent external effects.** External writes need idempotency keys + receipts; uncertain outcomes reconciled, never blind-retried.
5. **No secrets in logs/events/prompts/memory.** Redact tokens, keys, passwords, cookies, auth headers.
6. **Inspectable/auditable.** Sensitive actions emit audit records with correlation IDs.
7. **Replaceable adapters.** Model/browser/connector/sandbox/queue behind contracts.

## 3. Current Progress

| Phase | Status | Progress | Summary |
|---|---:|---:|---|
| 0. Foundation | `[~]` | 91% | Monorepo, Docker Postgres/Redis, Drizzle schema, API/worker, CI green (`45441229198`), idempotency/CAS. Pending Drizzle migration-history alignment. |
| 1. UI/Task Core | `[~]` | 70% | Task create/control, SSE timeline with reconnect/stale, approvals panel, browser preview panel (polling screenshot), takeover controls. Pending richer UI, SSE cursor-resume E2E proof, WS `/v1/ws` decision/impl. |
| 2. Agent Runtime | `[~]` | 22% | Helm-native runtime routes assistant/browser tasks; emits normalized `runtime.*`; high-risk prompts pause for approval. Pending real model/provider adapter, planning/tools/memory/skills/scheduler/subagents. |
| 3. Browser Execution | `[~]` | 48% | Playwright browser-worker smoke pass; browser tasks create/navigate/snapshot/screenshot; screenshot preview polling; 5m session TTL; takeover request/resume API+UI baseline; DOM/screenshot artifacts saved to disk and persisted in `browser_artifacts` with sha256/size/metadata; guarded external-action endpoint enforces approval+actionHash+idempotency receipt with dedupe. Pending live WS/CDP stream, persisted/emitted takeover state, agent pause/resume around takeover, runtime wiring through guarded path, richer actions/downloads/crash recovery. |
| 4. Approvals/Security | `[~]` | 35% | Approval DB/API/UI/worker flow; approve/reject; `action_receipts`; approval resolve records approved receipt; worker records executed receipt for approved runs; external browser action API enforces approved `actionHash`+`approvalId`+idempotency key and dedupes replay. Pending enforcement in all runtime execution paths, vault/connectors/policy hardening. |
| 5. Temporal/Reliability | `[~]` | 68% | Temporal routing/fail-closed, stub/real/mock rollback proofs, DB-canonical reconciliation/scheduler, Temporal schedule/fault-injection guards. Real-provider/real-Temporal depth blocked. |
| 6. BrowserOS Upgrade | `[~]` | 34% | Adapter boundary/Playwright default/BrowserOS HTTP-stub/status/dispatch flag/contract tests. Real BrowserOS parity blocked. |
| 7. Memory/Skills/Proactivity | `[~]` | 48% | Identity/policy/memory/skills/proactivity flags, P7 tables, enforcement helpers. Self-improvement design-only; activation needs explicit approval. |
| 8. Hardening/Release | `[~]` | 43% | CI green, backup scripts+dry-run, redaction/checklists, task export/delete controls. Drills/scans/threat model/PII/compliance signoff pending. |

## 4. What You Can Run Today

### Prerequisites
- Node 22+
- pnpm 9+
- Docker Desktop (for Postgres/Redis)

### Start infrastructure
```powershell
cd C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\helm
docker compose -f infra/docker-compose.yml up -d
```

### Install/build
```powershell
pnpm install
pnpm build
```

### Start dev services
```powershell
pnpm dev
```
Or individually:
```powershell
pnpm --filter @helm/api dev
pnpm --filter @helm/worker dev
pnpm --filter @helm/browser-worker dev
pnpm --filter @helm/web dev --host 127.0.0.1 --port 5174 --strictPort
```

### Current dev URLs/ports
- Web UI: `http://127.0.0.1:5174` (may be 5173 if free)
- API: `http://127.0.0.1:8787`
- Browser worker: `http://127.0.0.1:8790`
- Postgres: Docker `infra-postgres-1` / `localhost:5432`
- Redis: Docker `infra-redis-1` / `localhost:6379`

### Health checks
```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
Invoke-RestMethod http://127.0.0.1:8790/health
```

## 5. Repo Map

```text
helm/
  AGENTS.md                     # Agent rules/invariants
  README.md                     # Project readme
  LICENSE                       # All rights reserved (competition context)
  THIRD_PARTY_NOTICES.md        # Dependency license notices
  package.json                  # pnpm/turbo scripts
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  .env.example
  infra/
    docker-compose.yml          # Postgres 16 + Redis 7
  packages/
    shared/                     # Contracts/types/schemas/errors/events/browser/runtime/approval
    db/                         # Drizzle schema, db client, seed
    observability/              # Pino logger/redaction foundation
  backend/
    api/                        # Hono API: tasks/events/approvals/browser proxy
    worker/                     # DB lease worker, runtime execution, event persistence
    browser-worker/             # Playwright executor/session/action API
  frontend/
    web/                        # Vite+React+TanStack Query UI
  scripts/
    e2e-smoke.mjs
  tests/
    integration/
  changes/                      # Project tracker/docs/evidence - READ THIS FOLDER
```

## 6. Architecture (Current)

```text
Frontend (React) 
  -> API (Hono) /v1/tasks,/v1/events/stream,/v1/approvals,/v1/browser/*
      -> Postgres (tasks, task_events, approvals, action_receipts, browser_artifacts, audit_log)
      -> Redis (planned; infra present)
  -> Worker (poll/lease queued tasks)
      -> HelmNativeRuntime
          -> assistant path (placeholder planning/completion)
          -> browser path (browserTask -> browser-worker)
      -> persists runtime events/artifacts/receipts
  -> Browser Worker (Playwright+Chromium)
      -> sessions/actions/screenshot/takeover/external-action
      -> artifact files on disk (.data/browser-artifacts)
```

## 7. Key Contracts

- **Task lifecycle:** `packages/shared/src/task-control.ts` + task status schema. API control endpoint enforces CAS transitions.
- **Runtime:** `packages/shared/src/agent-runtime.ts` defines `AgentRuntime`, normalized `runtime.*` events, `waiting_approval`.
- **Browser:** `packages/shared/src/browser.ts` defines `BrowserExecutor`, session/control/takeover/external-action schemas.
- **Approvals:** `packages/shared/src/approval.ts`; DB table `approvals`; API resolve endpoint; worker creates pending approvals on high-risk proposals.
- **Receipts:** `action_receipts` table stores approved/executing/executed/failed receipts keyed by idempotency key.
- **Artifacts:** `browser_artifacts` table stores screenshot/snapshot/external-action evidence metadata (path, sha256, size, mime).

## 8. Safety Model (Current)

- High-risk prompt detection in runtime/browser task pauses with `runtime.tool.proposed` (`approvalRequired=true`, `actionHash`) and task becomes `waiting_approval`.
- Approval resolve: approve requeues task; reject cancels with `APPROVAL_REJECTED`.
- External browser side effect API (`POST /v1/browser/sessions/:id/external-action`) **enforces**: approved approval, matching `approvalId`, matching `actionHash`, idempotency key claim, dedupe replay, receipt status updates, audit/event/artifact persistence.
- **Gap:** not all runtime/browser-task real external actions are wired through this guarded path yet; takeover state is not fully persisted/emitted as task events; agent pause/resume around takeover not enforced.

## 9. How To Verify

```powershell
cd C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\helm
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:e2e
```

Recent smoke evidence (2026-11-22):
- Browser task `Visit example.com and capture evidence` -> `succeeded`; session stayed ready for preview; screenshot/dom artifacts persisted.
- Risky browser task -> `waiting_approval`; external action before approval -> `403 FORBIDDEN`; approve -> succeeded; external action after approval -> `200 executed` with receipt/artifact; replay same idempotency key -> `200 deduped`.

## 10. Known Gaps / Next Moves

1. **Persist/emit takeover control state** as task/session events; wire agent pause/resume around takeover.
2. **Route all real runtime/browser-task external side effects** through guarded external-action path (no unguarded side effects).
3. **Live preview**: replace polling with WS/CDP stream; interactive remote control.
4. **Evidence UX**: artifact list/download links in UI; richer artifact types.
5. **Runtime**: real model/provider adapter behind `AgentRuntime`, richer planning/tools/memory/skills.
6. **Reliability/security**: WS replay/AG-UI reducer, fault injection, HelmError wiring, vault, connectors, Temporal, hardening.

## 11. Known Environment Caveats

- **Local PG17 panic** at `C:\Program Files\PostgreSQL\17\data` (`replication checkpoint has wrong magic`). Do **not** use/touch. Use Docker Postgres `infra-postgres-1`.
- Dev tsconfig path toggle workaround is sometimes used for build/typecheck because dev uses `src` paths; confirm before changing.
- Git repo not initialized at workspace root; Helm files are currently untracked in this directory state.

## 12. Where To Track Work

All project tracking lives in `changes/`:
- `README.md` - read order/index
- `ONBOARDING.md` - this file
- `CURRENT_STATE.md` - authoritative snapshot
- `SESSION_LOG.md` - append-only session evidence
- `DECISIONS.md` - decisions/ADRs
- `FIX_LOG.md` - non-trivial fixes
- `phase-*.md` - phase plans/checklists
- `RUNBOOK.md` - commands

**Rule:** after meaningful work, update `CURRENT_STATE.md`, `SESSION_LOG.md`, active phase doc, and add `FIX_LOG.md`/`DECISIONS.md` entries when applicable.
