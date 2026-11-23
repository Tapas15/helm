# Phase 2 - Agent Runtime (Hermes-like capabilities, Helm-owned)

**Status:** `[ ]` Not started  
**Blueprint refs:** Phase 2, `05-Hermes-Agent-Runtime.md`

## Goal
Add Hermes-like agent capabilities inside Helm, while keeping Helm as the product/control plane. Implement Helm-native runtime contracts first; Hermes may be used later only as an optional `AgentRuntime` adapter behind the same contract.

## Hermes-like Capabilities to Target (selected, not full Hermes clone)
- [ ] Model-agnostic runtime: cloud + local/OpenAI-compatible provider routing.
- [ ] Agent loop: plan, tool proposals, bounded context, streaming normalized events.
- [ ] Tool registry/MCP-style extensibility behind policy/approval gates.
- [ ] Persistent memory + user/project context files (`MEMORY`/project context), inspectable and redacted.
- [ ] Skills: reusable procedures, load-on-demand, create/refine from repeated work (audited).
- [ ] Scheduled automations/cron with delivery to Helm surfaces.
- [ ] Subagent delegation/parallel work with isolated context and summarized results.
- [ ] Checkpoints/rollback for risky file changes; interrupt/cancel cleanly.

## Completed
- [x] `AgentRuntime` contract + tests in `@helm/shared`.
- [x] Worker wired to Helm-native runtime; emits `runtime.*` events and detects high-risk prompts for approval proposal.

## Remaining (execution order)
- [x] Define `AgentRuntime` contract in `@helm/shared` (run, stream events, interrupt, tool proposals, model selection hooks).
- [ ] Add runtime event schema mapped to Helm task/event timeline; no vendor SDK leakage outside adapter.
- [~] Implement minimal Helm-native runtime loop first (single runtime, bounded planning, normalized runtime events; model/provider routing pending).
- [ ] Add model router (one cloud + one local/OpenAI-compatible).
- [ ] Add persistent memory/context files with redaction and user inspection.
- [ ] Add skill store/load/execute; later add audited self-improvement from repeated tasks.
- [ ] Add scheduler/cron + subagent delegation with policy/audit.
- [ ] Optional: Hermes sidecar adapter implementing same `AgentRuntime` contract + contract tests.

## Verification Evidence
- None.

