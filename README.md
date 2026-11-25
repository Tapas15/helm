# Helm

[![CI](https://github.com/Tapas15/helm/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Tapas15/helm/actions/workflows/ci.yml)

Helm is an original personal AI operating assistant built from scratch for the Dubai competition. It implements similar/better capabilities with Helm-owned code and replaceable contracts; no third-party proprietary/AGPL source is copied into this repository.

- Source blueprint: `../Personal_assistant/Planning/MASTER-TECHNICAL-BLUEPRINT.md`
- Session handoff: `changes/README.md` and `changes/CURRENT_STATE.md`
- Agent rules: `AGENTS.md`

## Progress

<div align="center">

[![Overall Progress](https://img.shields.io/badge/Overall_Progress-79.8%25-1f6feb?style=for-the-badge)](ROADMAP.md)
[![Current Phase](https://img.shields.io/badge/Current_Focus-P7_Contracts_%7C_P3_Evidence-f2cc60?style=for-the-badge)](ROADMAP.md)
[![Roadmap](https://img.shields.io/badge/Journey-Past_%7C_Present_%7C_Future-238636?style=for-the-badge)](ROADMAP.md)

**[Explore the full visual roadmap →](ROADMAP.md)**

</div>

| Scope | Progress | Notes |
|---|---:|---|
| **Overall** | **79.8%** | Equal-weight P0-P8. Last watched CI green: [45614969597](https://github.com/Tapas15/helm/actions/runs/45614969597) (7bf214c); later commits pushed, CI not watched per directive. P7b memory contracts hardened (disabled/flag-disabled no-leak/no-mutation, dry-run-only consolidation/retention, fail-closed embedding seam, no default external calls). P3 browser screenshot/snapshot artifact persistence + ownership-checked artifact listing + takeover state contracts added. P7c/P7d activation/apply/auto-run remains explicitly blocked. |
| Phase 0 Foundation | 94% | Monorepo/CI/Docker/contracts stable; Drizzle alignment script cwd-independent/idempotent; local gates PASS; fresh-clone CI confirmation after push remains |
| Phase 1 UI/Task Core | 92% | Chat/SSE/approvals/preview/takeover usable; SSE `Last-Event-ID` resume fallback + cursor validation covered; live UI smoke/fault-injection depth pending |
| Phase 2 Agent Runtime | 73% | Local Ollama streaming, tool policy/approval gating, model override/config validation; interrupt/resume/checkpoint, evals, live real browser+connector E2E pending |
| Phase 3 Browser Execution | 93% | Playwright worker, CDP screencast, WS proxy, persist/restore, guarded actions; screenshot/snapshot artifact DB persistence + ownership-checked artifact listing + takeover request/resume state contracts; live WS/takeover smoke blocked in shell |
| Phase 4 Connectors/Vault | 90% | Vault AES-GCM, Gmail/Calendar read+write, guarded receipts/reconcile UI; real OAuth connect/test/send/create E2E verified; refresh/revoke/uncertain-reconcile hardening pending |
| Phase 5 Temporal/Reliability | 68% | ADR-002, DB-canonical reconciliation/scheduler/dry-run, Temporal schedule/fault-injection guards, env-gated reconciliation e2e PASS; real-provider no-duplicate and deeper Temporal operator/sandbox proof pending |
| Phase 6 BrowserOS Upgrade | 66% | Playwright default; external BrowserOS MCP adapter behind contract; dispatch OFF. Env-gated MCP smoke/parity evidence exists; deeper parity, formal STRIDE/threat-model/PII retention evidence, and dispatch gate pending |
| Phase 7 Memory/Skills/Proactivity | 97% | P7a feedback/eval/proposal scaffold + redacted flag-gated emissions; P7b memory CRUD/export/audit/retrieval/consolidation+retention dry-runs, fail-closed embedding seam, contract hardening. Blocked: retention enforcement/delete, consolidation apply/merge, external embedding runtime wiring default off, worker-claim/browser-worker DB feedback contract decisions, P7c/P7d activation/apply/auto-run (explicit written approval required) |
| Phase 8 Hardening/Release | 43% | Backup scripts+dry-run, redaction/checklists, task export/delete, dep audit baseline; backup/restore drill, scan gating, threat model, PII/legal, Dubai signoff pending |

> Detailed journey: **[ROADMAP.md](ROADMAP.md)** · Operational evidence: **[changes/CURRENT_STATE.md](changes/CURRENT_STATE.md)** · P7b contract: **[changes/p7b-memory-status-contract.md](changes/p7b-memory-status-contract.md)**

### CI / Build Status

- **GitHub Actions CI is green on `main`** when lint, typecheck, test, and build pass. The badge above reflects the latest `main` workflow result.
- **Why the green line may look "constant":** CI runs on every push/PR and reports pass/fail for that commit; it does not measure product completion. During active build phases, many commits may pass CI while feature completeness is still partial. A flat green contribution/check line means checks are passing consistently, not that the project is 100% complete.
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






















