# Helm

[![CI](https://github.com/Tapas15/helm/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Tapas15/helm/actions/workflows/ci.yml)

Helm is an original personal AI operating assistant built from scratch for the Dubai competition. It implements similar/better capabilities with Helm-owned code and replaceable contracts; no third-party proprietary/AGPL source is copied into this repository.

- Source blueprint: `../Personal_assistant/Planning/MASTER-TECHNICAL-BLUEPRINT.md`
- Session handoff: `changes/README.md` and `changes/CURRENT_STATE.md`
- Agent rules: `AGENTS.md`

## Progress

<div align="center">

[![Overall Progress](https://img.shields.io/badge/Overall_Progress-73.2%25-1f6feb?style=for-the-badge)](ROADMAP.md)
[![Current Phase](https://img.shields.io/badge/Current_Focus-P6_BrowserOS_Security_Hardening-238636?style=for-the-badge)](ROADMAP.md#present--what-were-building-now)
[![Roadmap](https://img.shields.io/badge/Journey-Past_%7C_Present_%7C_Future-f2cc60?style=for-the-badge)](ROADMAP.md)

**[Explore the full visual roadmap →](ROADMAP.md)**

</div>

| Scope | Progress | Notes |
|---|---:|---|
| **Overall** | **73.2%** | CI green [45559337267](https://github.com/Tapas15/helm/actions/runs/45559337267) (`5597a95`); local lint/typecheck/build/test PASS; P4 real OAuth write E2E verified; P6 BrowserOS MCP adapter hardened (12/12 contract, env-gated smoke 5/5 PASS on 2026-11-25 including positive click/fill on controlled local page + adapter-level takeover parity); deeper parity/security/dispatch gate, real-provider/Temporal depth, live UI smoke, ops/legal signoff remain |
| Phase 0 Foundation | 93% | Monorepo/CI/Docker/contracts stable; Drizzle alignment script cwd-independent/idempotent; local gates PASS; fresh-clone CI confirmation after push and tsconfig dist/src cleanup remain |
| Phase 1 UI/Task Core | 91% | Chat/SSE/approvals/preview/takeover usable; SSE cursor-resume/fault-injection E2E depth and live UI smoke pending |
| Phase 2 Agent Runtime | 73% | Local Ollama streaming, tool policy/approval gating, model override/config validation; live real browser+connector E2E and eval evidence pending |
| Phase 3 Browser Execution | 93% | Playwright worker, CDP screencast, WS proxy, persist/restore, guarded actions; live WS/takeover smoke pending |
| Phase 4 Connectors/Vault | 90% | Vault AES-GCM, Gmail/Calendar read+write, guarded receipts/reconcile UI; real OAuth connect/test/send/create E2E verified; refresh/revoke/uncertain-reconcile hardening pending |
| Phase 5 Temporal/Reliability | 68% | ADR-002, DB-canonical reconciliation/scheduler/dry-run, Temporal schedule/fault-injection guards, env-gated reconciliation e2e PASS; real-provider no-duplicate and deeper Temporal operator/sandbox proof pending |
| Phase 6 BrowserOS Upgrade | 60% | Playwright default; external BrowserOS MCP adapter (`BROWSEROS_MCP_URL`) behind contract; capability/timeout/error classification; selector-not-found hardening; contract 17/17 PASS; env-gated smoke 5/5 PASS (2026-11-25, includes positive click/fill local page + takeover request/resume/stream-status parity); http/https URL validation + non-loopback endpoint guard (`HELM_BROWSEROS_ALLOW_REMOTE=1` opt-in); deeper artifact/error parity, security/compliance review, explicit dispatch gate pending |
| Phase 7 Memory/Skills/Proactivity | 48% | Identity/policy enforcement, P7 tables, memory/skills/proactivity flags; identity vault/UI, scheduler, provenance/CRUD/export pending; self-improvement activation needs explicit approval |
| Phase 8 Hardening/Release | 43% | Backup scripts+dry-run, redaction/checklists, task export/delete, dep audit baseline; backup/restore drill, scan gating, threat model, PII/legal, Dubai signoff pending |

> Detailed journey, milestones, and past/present/future plan: **[ROADMAP.md](ROADMAP.md)** � Operational evidence: **[changes/CURRENT_STATE.md](changes/CURRENT_STATE.md)**

### CI / Build Status

- **GitHub Actions CI is green on `main`** when lint, typecheck, test, and build pass. The badge above reflects the latest `main` workflow result.
- **Why the green line may look “constant”:** CI runs on every push/PR and reports pass/fail for that commit; it does not measure product completion. During active build phases, many commits may pass CI while feature completeness is still partial. A flat green contribution/check line means checks are passing consistently, not that the project is 100% complete.
- **Service-dependent integration tests** (Postgres/API/browser live) are gated behind explicit env vars (`HELM_INTEGRATION=1`, `HELM_INTEGRATION_API=1`) so default CI stays deterministic; they are run intentionally in environments where those services are provisioned.

## Architecture

```mermaid
flowchart TB
  subgraph Clients["Clients"]
    WEB[Web]
    MOBILE[Mobile - planned]
    WA[WhatsApp - planned]
    CLI[CLI - planned]
  end

  WEB --> GW[Helm Gateway / API Control Plane]

  GW --> CONV[Conversations / Task Messages]
  GW --> GOALS[Goals / Tasks]
  GW --> ROUTER[Event Router / SSE-WS]
  GW --> SCHED[Scheduler / Worker Lease Loop - planned durable]

  GOALS --> ORCH[Agent Orchestrator / HelmNativeRuntime]
  CONV --> ORCH
  SCHED --> ORCH

  ORCH --> MR[Model Router / Adapters]
  MR --> MODELS[OpenAI-compatible / Ollama / future native APIs]

  ORCH --> UR[UNTRUSTED RUNTIME\nfiles / shell / skills / code / subagents]
  UR --> BB[Browser Broker / Browser Worker]

  UR --> SP[SENTINEL PLANE\npolicy / approvals / egress / audit / data controls]
  BB --> SP

  SP --> CB[Credential Broker / Vault - planned]
  SP --> CW[Connector Workers - planned]

  CB --> OUT[Outside World\nwebsites / APIs / email / services]
  CW --> OUT
  BB --> OUT

  GW --> DB[(Postgres: tasks, messages, events,\napprovals, receipts, artifacts, audit)]
  GW --> REDIS[(Redis / queues - planned)]
```

**Flow:** client prompt -> gateway stores task/message -> orchestrator leases task -> model adapter streams response/tool calls -> untrusted runtime proposes actions -> sentinel plane enforces approval/hash/idempotency/audit -> browser/connector brokers execute allowed actions -> receipts/artifacts/events/messages persist -> clients render chat, timeline, approvals, evidence, live preview.

## License and Third-Party Dependencies

- Helm project license: see LICENSE.
- Third-party dependency licenses: see THIRD_PARTY_NOTICES.md.
- AGPL/copyleft code (e.g., BrowserOS) is not vendored into Helm. Optional external adapters require separate compliance review.






















