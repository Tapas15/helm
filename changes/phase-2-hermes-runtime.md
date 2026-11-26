# Phase 2 - Agent Runtime (Helm-native, Hermes-like capabilities)

**Status:** `[~]` 83%  
**Blueprint refs:** Phase 2, `05-Hermes-Agent-Runtime.md`

## Goal
Helm-owned agent runtime with Hermes-like capabilities. Implement Helm-native runtime/contracts first; any Hermes adapter must be optional, isolated, contract-tested, and no Hermes code copied.

## What we have done
- **Runtime contract/foundation**: `AgentRuntime` contract + tests in `@helm/shared`; worker wired to `HelmNativeRuntime`; normalized `runtime.*` events.
- **Local-first model path**: OpenAI-compatible streaming adapter; Ollama defaults (`llama3.2:latest`, `http://127.0.0.1:11434`), no external API key required by default.
- **Tool-calling loop**: Normalized runtime events, batched delta persistence, tool loop/policy/registry, unknown tool blocked, browser sessionId normalization.
- **Safety/guardrails**: High-risk prompt detection emits `runtime.tool.proposed` with `approvalRequired=true`, `actionHash`; task `waiting_approval`; approve requeues/reject cancels. Runtime guardrails include timeout, max tokens, AbortController, redacted model errors.
- **Model/tool capability controls**: `HELM_MODEL_TOOL_CAPABLE_ALLOWLIST`, `isToolCapableModel()` warning/gating; browser tools gated by `shouldExposeBrowserTools()` and require `sessionId`.
- **Runtime config/override**: Thread abstraction `RuntimeThreadMessage`/`input.thread`; model override with clamped timeout/maxTokens; `GET /v1/runtime/config`, `POST /v1/runtime/model-validate`.
- **Tests/probes**: Worker tests PASS (11/11, `runtime.test.ts`, `runtime.behavior.test.ts`). Ollama probes: `llama3.2:latest` PASS, `qwen2.5:latest` PASS; `qwen3.5:latest`/`qwen3:4b` timed out at 90s.

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
- [x] Shared model routing policy (`runtime-policy.ts`): local-default/override/fallback routing, sensitivity warning for non-local provider, tool-capability allowlist decision, policy exposed via runtime config/validate and worker runtime events.
- [x] Deterministic runtime eval harness: approval correctness, tool-policy reliability, resume dedupe duplicate-actionHash no-dispatch in streamChat, resume dedupe duplicate read-only tool argsKey no-dispatch in streamChat, interrupted->cancelled recovery semantics (`runtime.evals.test.ts`).
- [x] Hermes sidecar adapter contract skeleton (fail-closed, no Hermes code copied) + contract test (`hermes-runtime-adapter.ts/.test.ts`).
- [x] Runtime checkpoint scaffolding + resume guard: worker derives/persists `runtimeCheckpoint` at safe boundaries; emits `runtime.checkpoint.resumed` + `runtime.checkpoint.resume_plan_applied` (counts); dedupes approval proposals by actionHash/executed receipt; persists bounded `resumePlan` with completed tool refs/action hashes/argsKey; runtime tool policy blocks duplicate side-effect `actionHash` and duplicate read-only same-args calls from resumePlan and emits `runtime.tool.deduped` resume-safe boundary; on resume, pending unresolved approval returns to `waiting_approval` without rerunning runtime, executed-receipt pending approval clears plan and continues safely. **Narrowed semantics: not full step-level replay engine.**
- [x] Worker tests: `backend/worker/src/runtime.test.ts`, `runtime.behavior.test.ts`, `runtime.evals.test.ts`, `hermes-runtime-adapter.test.ts`, `runtime-checkpoint.test.ts`, `process-task.checkpoint.test.ts`, `process-task.feedback.test.ts` PASS.
- [x] Ollama probes: `llama3.2:latest` PASS, `qwen2.5:latest` PASS; `qwen3.5:latest`/`qwen3:4b` timed out at 90s.

### Remaining / Blocked
- [ ] Live end-to-end runtime validation across real browser + connector flows. **Blocked:** needs real connector/browser env and live smoke.
- [ ] Integration-driven behavior tweaks from real runs.
- [ ] Production/model-provider behavior evidence.
- [ ] Richer provider/model routing policy depth (cost-aware routing, persisted selection UX polish, enforced sensitive-egress policy gates). **Partially started:** shared policy decision + warnings wired.
- [ ] Interrupt/resume/checkpoint semantics for long-running runs. **Partial:** checkpoint persisted, non-terminal resume event emitted, approval dedupe guard added, bounded resumePlan scaffolded; durable resume-from-checkpoint execution/replay semantics still not implemented.
- [ ] Runtime evals depth: real tool-calling reliability, approval correctness/recovery under real providers/browser/connectors. **Partially started:** deterministic harness added.
- [ ] Optional Hermes sidecar adapter live integration implementing same `AgentRuntime` contract against real Hermes runtime (no Hermes code copied). **Partially started:** fail-closed skeleton + contract test added.

## Evidence
- `pnpm -C packages/shared build` PASS.
- `pnpm -C packages/shared exec vitest run src/runtime-policy.test.ts src/agent-runtime.test.ts --reporter=verbose` PASS (7/7).
- `pnpm -C backend/worker exec vitest run src/runtime.test.ts src/runtime.behavior.test.ts --reporter=verbose` PASS (11/11).
- `pnpm -C backend/worker exec vitest run src/runtime.evals.test.ts src/hermes-runtime-adapter.test.ts --reporter=verbose` PASS (5/5).
- `pnpm -C backend/worker exec vitest run src/runtime-checkpoint.test.ts src/process-task.checkpoint.test.ts src/process-task.feedback.test.ts --reporter=verbose` PASS (8/8).
- `pnpm -C backend/api exec vitest run src/routes/runtime.test.ts --reporter=verbose` PASS (3/3).
- `pnpm -C packages/shared typecheck` PASS; `pnpm -C backend/worker typecheck` PASS; `pnpm -C backend/api typecheck` PASS.
- `pnpm -C backend/worker lint` PASS; `pnpm -C backend/api lint` PASS (0 errors, 7 pre-existing warnings).
- Smoke/probe evidence recorded in session logs/FIX_LOG as applicable.
