# Phase 2 - Agent Runtime (Helm-native, Hermes-like capabilities)

**Status:** `[~]` 96%  
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
- **Control-check cadence hardening (2026-11-27)**: worker checks DB task control status on key runtime events and at a periodic cadence during runtime, interrupting/persisting interrupted checkpoint on `cancelled`/`paused` to reduce overwrite windows in long event streams.
- **Interrupted checkpoint resume (2026-11-27)**: queued tasks with interrupted checkpoint statusHint resume safely (emit `runtime.checkpoint.resumed` with `resumedFrom=interrupted`, reset checkpoint to running boundary) instead of being terminal-ignored. Completed/failed checkpoints remain terminal-ignored on queued reclaim. Narrowed semantics: no full step replay.
- **Tests/probes**: Worker tests PASS (runtime/checkpoint/process-task targeted suites; see Evidence). Ollama probes: `llama3.2:latest` PASS, `qwen2.5:latest` PASS; `qwen3.5:latest`/`qwen3:4b` timed out at 90s.

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
- [x] Checkpoint boundary hardening (2026-11-27, local): `runtime.tool.started` is a safe boundary but no longer records completed tool refs/action hashes (prevents false completion on crash after dispatch start). Deterministic regression proves crash after `runtime.tool.completed` checkpoint before next model call does not re-execute side effect when resumePlan carries completed actionHash; worker resume context + runtime policy dedupe prevent dispatch. Narrowed: does not prove full durable replay across arbitrary mid-tool crash points.
- [x] In-flight tool checkpoint observability (2026-11-27, local): untime.tool.started records bounded esumePlan.inFlightToolRefs; completion/dedupe clears matching refs. Resume prompt and untime.checkpoint.resume_plan_applied include in-flight counts/names for crash-after-dispatch-start visibility. Narrowed: metadata only, no durable in-flight replay/continuation claim.
- [x] Interrupted checkpoint resume on queued task: interrupted checkpoint resumes with `runtime.checkpoint.resumed` (`resumedFrom=interrupted`) and running boundary reset; completed/failed remain terminal-ignored. Deterministic process-task regression added. Narrowed semantics: no full step replay.
- [x] Sensitive-egress enforcement gate: `HELM_ENFORCE_SENSITIVE_EGRESS=1` denies sensitive task routing to non-local provider (fail-closed `POLICY_DENIED`, `guardrail=sensitive_egress`); policy fields exposed in runtime config/validate and worker runtime events. Local sensitive routing remains allowed.
- [x] Worker tests: `backend/worker/src/runtime.test.ts`, `runtime.behavior.test.ts`, `runtime.evals.test.ts`, `hermes-runtime-adapter.test.ts`, `runtime-checkpoint.test.ts`, `process-task.checkpoint.test.ts`, `process-task.feedback.test.ts` PASS.
- [x] Ollama probes: `llama3.2:latest` PASS, `qwen2.5:latest` PASS; `qwen3.5:latest`/`qwen3:4b` timed out at 90s.

### Remaining / Blocked
- [ ] Live end-to-end runtime validation across real browser + connector flows. **Blocked:** needs real connector/browser env and live smoke.
- [ ] Integration-driven behavior tweaks from real runs.
- [ ] Production/model-provider behavior evidence.
- [ ] Richer provider/model routing policy depth (cost-aware routing, persisted selection UX polish, broader sensitive-egress classification beyond explicit sensitivity flag). **Partially started:** shared policy decision + warnings + enforceable sensitive-egress gate wired.
- [ ] Interrupt/resume/checkpoint semantics for long-running runs. **Partial:** cooperative interrupt + control-status non-overwrite + checkpoint persisted; pending-approval resume guard and dedupe exist; durable resume-from-checkpoint execution/replay semantics still not implemented.
- [ ] Runtime evals depth: real tool-calling reliability, approval correctness/recovery under real providers/browser/connectors. **Partially started:** deterministic harness added.
- [ ] Optional Hermes sidecar adapter live integration implementing same `AgentRuntime` contract against real Hermes runtime (no Hermes code copied). **Partially started:** fail-closed skeleton + contract test added.

## Resume / Interrupt Semantics (Narrowed, Current)

**Supported now (deterministic, tested):**
- Checkpoint persistence at safe runtime boundaries (`runtimeCheckpoint` in task checkpoint/state).
- Non-terminal resume emits `runtime.checkpoint.resumed` and `runtime.checkpoint.resume_plan_applied` with counts/boundary.
- Pending approval resume guard: unresolved pending approval resumes task to `waiting_approval` without rerunning runtime; executed-receipt pending approval clears pending plan and continues safely.
- Approval/action dedupe: duplicate approval requests by `actionHash`/existing receipt are deduped (no duplicate approval/receipt rows).
- Side-effect dedupe: duplicate tool call with completed `actionHash` in `resumePlan` is denied/no-dispatch and emits `runtime.tool.deduped`.
- Read-only dedupe: duplicate read-only tool call with same `name+argsKey` in `resumePlan` is denied/no-dispatch and emits `runtime.tool.deduped`.
- Resume prompt/context injection: compact resumePlan summary injected into runtime system prompt (metadata-only hint).
- Cooperative interrupt: worker observes `cancelled`/`paused` task status during runtime, calls `runtime.interrupt(runId)`, persists checkpoint, clears lease, and does not overwrite control status with terminal runtime result. Runtime abort emits `runtime.interrupted` (mapped to cancelled result).

**Not supported yet (do not claim):**
- Full step-level replay/continuation engine that deterministically rehydrates model/tool loop and skips arbitrary completed safe work across complex resumed flows.
- Durable replay execution after process crash mid-tool-loop beyond current checkpoint guards/dedupe.
- Real-provider/browser/connector end-to-end resume/interrupt proof.

## Evidence
- `pnpm -C packages/shared build` PASS.
- `pnpm -C packages/shared exec vitest run src/runtime-policy.test.ts src/agent-runtime.test.ts --reporter=verbose` PASS (7/7; policy includes sensitive-egress enforcement cases).
- `pnpm -C backend/worker exec vitest run src/runtime.test.ts src/runtime.behavior.test.ts src/runtime.evals.test.ts src/runtime-checkpoint.test.ts src/process-task.checkpoint.test.ts src/hermes-runtime-adapter.test.ts --reporter=verbose` PASS (33/33, 2026-11-27 local; includes sensitive-egress deny).
- `pnpm -C backend/worker exec vitest run src/runtime.behavior.test.ts src/runtime.test.ts --reporter=verbose` PASS (13/13, 2026-11-27 local, interrupt behavior).
- `pnpm -C backend/worker exec vitest run src/process-task.checkpoint.test.ts --reporter=verbose` PASS (7/7, 2026-11-27 local, includes paused/cancelled mid-runtime no-overwrite + interrupt request).
- `pnpm -C backend/worker exec tsc --noEmit --pretty false` PASS (2026-11-27 local).
- `pnpm -C backend/api exec vitest run src/routes/runtime.test.ts --reporter=verbose` PASS (3/3).
- `pnpm -C packages/shared typecheck` PASS; `pnpm -C backend/worker typecheck` PASS; `pnpm -C backend/api typecheck` PASS.
- `pnpm -C backend/worker lint` PASS; `pnpm -C backend/api lint` PASS (0 errors, 7 pre-existing warnings).
- Smoke/probe evidence recorded in session logs/FIX_LOG as applicable.
