# Helm

[![CI](https://github.com/Tapas15/helm/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Tapas15/helm/actions/workflows/ci.yml)

Helm is an original personal AI operating assistant built from scratch for the Dubai competition. It implements similar/better capabilities with Helm-owned code and replaceable contracts; no third-party proprietary/AGPL source is copied into this repository.

- Source blueprint: `../Personal_assistant/Planning/MASTER-TECHNICAL-BLUEPRINT.md`
- Session handoff: `changes/README.md` and `changes/CURRENT_STATE.md`
- Agent rules: `AGENTS.md`

## Progress

<div align="center">

[![Overall Progress](https://img.shields.io/badge/Overall_Progress-87.1%25-1f6feb?style=for-the-badge)](ROADMAP.md)
[![Current Phase](https://img.shields.io/badge/Current_Focus-P8_Coding_Stable_%7C_Manual_Gates_Pending-f2cc60?style=for-the-badge)](ROADMAP.md)
[![Roadmap](https://img.shields.io/badge/Journey-Past_%7C_Present_%7C_Future-238636?style=for-the-badge)](ROADMAP.md)

**[Explore the full visual roadmap ?](ROADMAP.md)**

</div>

| Scope | Progress | Notes |
|---|---:|---|
| **Overall** | **87.1%** | Equal-weight P0-P8 coding-only estimate. P8 coding-stable: shared redaction helper + route migrations/contracts, export/delete contracts, lint/tsc green (`378912c..5ad42fc`). **Release blocked by manual/ops/legal/security gates** (backup/restore drill, scan gating/SAST/secrets/container, STRIDE/threat-model, incident/key-rotation, PII/privacy/classification, compliance/Dubai signoff, chaos/SLO/alerts, packaging/release gates). |
| Phase 0 Foundation | 100% | Monorepo/CI/Docker/contracts stable; Drizzle alignment cwd-independent/idempotent; tsconfig workarounds removed (api/worker/browser-worker/temporal-worker); generated package src artifacts untracked+gitignored; CI Postgres + fresh-DB `db:migrate` smoke green; real ESLint config/scripts. Non-blocking debt: Node 20 action deprecation annotations, optional ESLint tightening; legacy `0001_p7_tables_manual.sql` by-design outside journal (no destructive reset). |
| Phase 1 UI/Task Core | 94% | Chat/SSE/approvals/preview/takeover usable; state-aware controls + mutation errors; explicit live/stale/offline SSE UX; keyboard/ARIA/focus/responsive polish. AG-UI `/v1/ws` deferred (SSE+browser WS sufficient); artifact storage/retention local-dev MVP, MinIO/retention deferred to P8. Browser E2E/fault-injection proof blocked. |
| Phase 2 Agent Runtime | 90% | Local Ollama streaming/tool loop/policy; checkpoint/resumePlan narrowed semantics, approval/read-tool dedupe guards, deterministic evals. Remaining: full durable step-level replay, live browser+connector/model-provider E2E, live Hermes sidecar. |
| Phase 3 Browser Execution | 93% | Playwright worker, CDP screencast, WS proxy, persist/restore, guarded actions; screenshot/snapshot artifact DB persistence + ownership-checked artifact listing + takeover request/resume state contracts; live WS/takeover smoke blocked in shell |
| Phase 4 Connectors/Vault | 90% | Vault AES-GCM, Gmail/Calendar read+write, guarded receipts/reconcile UI; real OAuth connect/test/send/create E2E verified; refresh/revoke/uncertain-reconcile hardening pending |
| Phase 5 Temporal/Reliability | 80% | ADR-002, routing/fail-closed, DB-canonical reconciliation/scheduler/dry-run; deterministic contract hardening for routing rollback, no-blind-retry/repeated-run, fault-injection, stub dedupe/schedule, run-shape/scope/disabled/operator-evidence semantics. Remaining: real-provider no-duplicate proof, real Temporal schedule/monitor/fault-injection depth, production/staging rollback proof. |
| Phase 6 BrowserOS Upgrade | 66% | Playwright default; external BrowserOS MCP adapter behind contract; dispatch OFF. Env-gated MCP smoke/parity evidence exists; deeper parity, formal STRIDE/threat-model/PII retention evidence, and dispatch gate pending |
| Phase 7 Memory/Skills/Proactivity | 97% | P7a feedback/eval/proposal scaffold + redacted flag-gated emissions; P7b memory CRUD/export/audit/retrieval/consolidation+retention dry-runs, fail-closed embedding seam, contract hardening. Blocked: retention enforcement/delete, consolidation apply/merge, external embedding runtime wiring default off, worker-claim/browser-worker DB feedback contract decisions, P7c/P7d activation/apply/auto-run (explicit written approval required) |
| Phase 8 Hardening/Release | 74% | **Coding-stable.** Shared redaction helper + route migrations/contracts, export/delete contracts, backup scripts/docs/checklists, `tsc` PASS, lint 0 errors/10 pre-existing warnings. **Blocked (manual/external):** full backup/restore drill (artifacts+vault-key), security scan gating/SAST/secrets/container, STRIDE/threat-model signoff, incident/key-rotation runbook, PII retention/export/delete/privacy/classification signoff, compliance/provenance/Dubai signoff, chaos/fault matrix, SLO dashboards/alerts, packaging/release gates. |

> Detailed journey: **[ROADMAP.md](ROADMAP.md)** · Operational evidence: **[changes/CURRENT_STATE.md](changes/CURRENT_STATE.md)** · P7b contract: **[changes/p7b-memory-status-contract.md](changes/p7b-memory-status-contract.md)**

### CI / Build Status

- **GitHub Actions CI is green on `main`** when lint, typecheck, test, and build pass. The badge above reflects the latest `main` workflow result.
- **Why the green line may look "constant":** CI runs on every push/PR and reports pass/fail for that commit; it does not measure product completion. During active build phases, many commits may pass CI while feature completeness is still partial. A flat green contribution/check line means checks are passing consistently, not that the project is 100% complete.
- **Service-dependent integration tests** (Postgres/API/browser live) are gated behind explicit env vars (`HELM_INTEGRATION=1`, `HELM_INTEGRATION_API=1`) so default CI stays deterministic; they are run intentionally in environments where those services are provisioned.

## Architecture

```mermaid
flowchart TB
  subgraph Clients["Clients"]
    WEB[Web UI - implemented]
    MOBILE[Mobile - planned]
    WA[WhatsApp - planned]
    CLI[CLI - planned]
  end

  WEB --> API[API Control Plane / Hono]

  API --> AUTH[Session auth / dev auth guard]
  API --> TASKS[Tasks / Messages / Approvals / Evidence / Receipts]
  API --> SSE[SSE Event Stream]
  API --> BPROXY[Browser WS Proxy + HTTP Proxy]

  TASKS --> DB[(Postgres: tasks, messages, events, approvals,\naction_receipts, artifacts, audit, memory, identities)]
  SSE --> DB

  API --> WORKER[Helm Worker / HelmNativeRuntime]
  WORKER --> MODEL[Model Adapter\nOpenAI-compatible / Ollama local-first]
  WORKER --> POLICY[Policy / Approval / actionHash / Idempotency]
  POLICY --> BROWSER[Browser Worker / Playwright default\nBrowserOS MCP adapter optional, dispatch OFF]
  POLICY --> CONNECTORS[Connectors: Gmail / Calendar\nVault AES-GCM]
  CONNECTORS --> EXT[Outside World\nWebsites / Google APIs / Services]
  BROWSER --> EXT

  BROWSER --> ART[(Artifacts / screenshots / DOM snapshots)]
  WORKER --> DB
  BROWSER --> DB
  API --> ART
```

**Current flow:** prompt -> API creates task/message -> worker leases task -> runtime streams model/tool events -> policy requires approval for high-risk actions -> browser/connector actions execute with `approvalId + actionHash + idempotency` -> receipts/artifacts/events persist -> UI renders chat, timeline, approvals, evidence, live preview.

**Current status:** P0-P7 core flows implemented; P8 coding-stable (redaction/contracts/docs). Release confidence is blocked by manual/ops/legal/security evidence gates, not core coding.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.15.4 --activate`)
- Postgres 16+ (local or Docker)
- Redis (optional for current baseline; required for future queue paths)

### Install

```bash
git clone https://github.com/Tapas15/helm.git
cd helm
pnpm install
cp .env.example .env
```

Update `.env` for your local services. Minimum local dev values:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/helm
HELM_ALLOW_DEV_AUTH=1
HELM_AUTH_DEV_USER_ID=usr_local_dev
HELM_REQUIRE_AUTH=0
```

### Database setup

```bash
pnpm db:migrate
# optional
pnpm db:seed
```

### Run backend

API (Hono, default `http://localhost:8787`):

```bash
pnpm --filter @helm/api dev
```

Worker (task/runtime worker):

```bash
pnpm --filter @helm/worker dev
```

Browser worker (Playwright/browser execution, default `http://localhost:8790`):

```bash
pnpm --filter @helm/browser-worker dev
```

### Run frontend

Web app (Vite, default `http://localhost:5173`, proxies `/v1` and `/health` to `http://localhost:8787`):

```bash
pnpm --filter @helm/web dev
```

### Run everything in dev mode

```bash
pnpm dev
```

This runs workspace `dev` tasks through Turbo; ensure Postgres/env vars are configured first.

## API

See [API documentation](docs/API.md) for the current route surface and handler count.
## License and Third-Party Dependencies

- Helm project license: see LICENSE.
- Third-party dependency licenses: see THIRD_PARTY_NOTICES.md.
- AGPL/copyleft code (e.g., BrowserOS) is not vendored into Helm. Optional external adapters require separate compliance review.
