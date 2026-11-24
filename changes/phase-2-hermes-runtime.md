# Phase 2 - Agent Runtime (Helm-native, Hermes-like capabilities)

**Status:** `[~]` 73%  
**Blueprint refs:** Phase 2, `05-Hermes-Agent-Runtime.md`

## Goal
Helm-owned agent runtime with Hermes-like capabilities. Implement Helm-native runtime/contracts first; any Hermes adapter must be optional, isolated, contract-tested, and no Hermes code copied.

## Checklist

### Completed
- [x] `AgentRuntime` contract + tests in `@helm/shared`.
- [x] Worker wired to `HelmNativeRuntime`; emits normalized `runtime.*` events.
- [x] Local Ollama default provider/model (no external API key required by default); streaming OpenAI-compatible adapter.
- [x] Tool-calling loop with normalized events and batched delta persistence.
- [x] Runtime guardrails: timeout, max tokens, redacted model errors, AbortController.
- [x] Tool-capable model allowlist/warning (`HELM_MODEL_TOOL_CAPABLE_ALLOWLIST`, `isToolCapableModel`).
- [x] Browser-intent gating (`shouldExposeBrowserTools`); browser tool handlers require `sessionId`.
- [x] High-risk prompt detection and approval gate (`runtime.tool.proposed`, `actionHash`, task `waiting_approval`; approve requeues, reject cancels).
- [x] Runtime tool policy/registry: `getRuntimeToolPolicy`, `evaluateToolPolicy`, `RUNTIME_TOOL_REGISTRY`, unknown tool blocked, browser sessionId normalization, high-risk approval/actionHash/idempotency enforcement.
- [x] Thread abstraction: `RuntimeThreadMessage` / `input.thread` preferred over `context.recentMessages`.
- [x] Model override wiring: worker/API/web/task settings `settings.modelOverride`; clamped timeout/maxTokens.
- [x] Runtime config/model validation API: `GET /v1/runtime/config`, `POST /v1/runtime/model-validate`.
- [x] Worker tests: `backend/worker/src/runtime.test.ts`, `runtime.behavior.test.ts` PASS (11/11).
- [x] Ollama probes: `llama3.2:latest` PASS, `qwen2.5:latest` PASS; `qwen3.5:latest`/`qwen3:4b` timed out at 90s.

### Remaining / Blocked
- [ ] Live end-to-end runtime validation across real browser + connector flows. **Blocked:** needs real connector/browser env and live smoke.
- [ ] Integration-driven behavior tweaks from real runs.
- [ ] Production/model-provider behavior evidence.
- [ ] Richer provider/model routing policy (sensitivity/capability/cost), persisted selection UX polish.
- [ ] Interrupt/resume/checkpoint semantics for long-running runs.
- [ ] Runtime evals: tool-calling reliability, approval correctness, recovery.
- [ ] Optional Hermes sidecar adapter implementing same `AgentRuntime` contract + contract tests (no Hermes code copied).

## Evidence
- `pnpm --filter @helm/worker test` PASS (11/11).
- `pnpm --filter @helm/shared typecheck`, `pnpm --filter @helm/api typecheck`, `pnpm --filter @helm/web typecheck` PASS in hardening batch.
- Smoke/probe evidence recorded in session logs/FIX_LOG as applicable.
