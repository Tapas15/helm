import { randomUUID } from "node:crypto";
import { decideRuntimeModelPolicy, inferRuntimeSensitivity, normalizeAllowlist, type AgentRuntime, type AgentRuntimeEvent, type AgentRuntimeInput, type AgentRuntimeResult, type RuntimeModelPolicyDecision } from "@helm/shared";
import { runBrowserTask } from "./browserTask.js";

const now = () => new Date().toISOString();

export type ModelConfig = { baseUrl: string; apiKey?: string; model: string; provider: string; timeoutMs: number; maxTokens: number; allowlist: string[]; policy: RuntimeModelPolicyDecision };
type ChatMsg = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: any[]; name?: string };

const DEFAULT_TOOL_CAPABLE_ALLOWLIST = ["llama3.2:latest", "llama3.2:3b", "qwen2.5:latest", "qwen2.5:3b"];

export function resolveModel(env: NodeJS.ProcessEnv = process.env, override?: { model?: string; provider?: string; baseUrl?: string; apiKey?: string; timeoutMs?: number; maxTokens?: number }, ctx: { taskKind?: string; toolCallingRequired?: boolean; sensitivity?: "normal" | "sensitive"; prompt?: string; context?: Record<string, unknown> | null } = {}): ModelConfig | null {
  const allowlist = normalizeAllowlist(env.HELM_MODEL_TOOL_CAPABLE_ALLOWLIST ?? DEFAULT_TOOL_CAPABLE_ALLOWLIST.join(","));
  const defaultBase = (env.HELM_MODEL_BASE_URL ?? env.OPENAI_BASE_URL ?? (env.OLLAMA_BASE_URL ? `${env.OLLAMA_BASE_URL}/v1` : "")).replace(/\/$/, "") || null;
  const defaultModel = env.HELM_MODEL ?? env.OPENAI_MODEL ?? (env.OLLAMA_BASE_URL ? "llama3.2:latest" : null);
  const defaultProvider = env.HELM_MODEL_PROVIDER ?? (defaultBase?.includes("11434") || env.OLLAMA_BASE_URL ? "ollama" : "openai-compatible");
  const inferred = inferRuntimeSensitivity({ sensitivity: ctx.sensitivity, prompt: ctx.prompt, context: ctx.context ?? null });
  const policy = decideRuntimeModelPolicy({
    requestedModel: override?.model,
    requestedProvider: override?.provider,
    requestedBaseUrl: override?.baseUrl,
    sensitivity: inferred.sensitivity,
    sensitivitySource: inferred.source,
    prompt: ctx.prompt,
    taskKind: ctx.taskKind ?? "assistant",
    toolCallingRequired: ctx.toolCallingRequired ?? false,
  }, { defaultModel, defaultProvider, defaultBaseUrl: defaultBase, allowlist, enforceSensitiveEgress: env.HELM_ENFORCE_SENSITIVE_EGRESS === "1" });
  if (!policy.selectedModel || !policy.selectedBaseUrl) return null;
  const apiKey = override?.apiKey ?? env.HELM_MODEL_API_KEY ?? env.OPENAI_API_KEY ?? "";
  const timeoutMs = Math.max(5000, Number(override?.timeoutMs ?? env.HELM_MODEL_TIMEOUT_MS ?? 120000));
  const maxTokens = Math.max(128, Number(override?.maxTokens ?? env.HELM_MODEL_MAX_TOKENS ?? 1024));
  return { baseUrl: policy.selectedBaseUrl.replace(/\/$/, ""), apiKey: apiKey || undefined, model: policy.selectedModel, provider: policy.selectedProvider ?? defaultProvider, timeoutMs, maxTokens, allowlist, policy };
}

export function isToolCapableModel(cfg: ModelConfig): boolean {
  if (cfg.provider !== "ollama") return cfg.policy.toolCapable;
  return cfg.allowlist.some(m => m.toLowerCase() === cfg.model.toLowerCase());
}

export function redactModelError(text: string): string {
  return text.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]").slice(0, 300);
}

export const RUNTIME_TOOL_REGISTRY = [
  { name: "browser_navigate", risk: "low", requiresApproval: false, description: "Navigate an existing browser session to a URL. Low-risk observation/navigation.", parameters: { type: "object", properties: { sessionId: { type: "string" }, url: { type: "string" } }, required: ["sessionId", "url"] } },
  { name: "browser_snapshot", risk: "low", requiresApproval: false, description: "Capture a text snapshot of current browser page.", parameters: { type: "object", properties: { sessionId: { type: "string" } }, required: ["sessionId"] } },
  { name: "browser_click", risk: "high", requiresApproval: true, description: "Click selector in browser. High-risk side effect: requires approved approvalId/actionHash/idempotencyKey.", parameters: { type: "object", properties: { sessionId: { type: "string" }, selector: { type: "string" }, approvalId: { type: "string" }, actionHash: { type: "string" }, idempotencyKey: { type: "string" } }, required: ["sessionId", "selector", "approvalId", "actionHash", "idempotencyKey"] } },
] as const;

export function getRuntimeToolPolicy(name: string) {
  return RUNTIME_TOOL_REGISTRY.find(t => t.name === name) ?? null;
}

function stableArgsKey(args: any): string {
  if (!args || typeof args !== "object") return "";
  const keys = Object.keys(args).filter((k) => !["approvalId", "actionHash", "idempotencyKey"].includes(k)).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (args as any)[k];
    if (v === undefined) continue;
    out[k] = v;
  }
  try { return JSON.stringify(out).slice(0, 500); } catch { return ""; }
}

export function evaluateToolPolicy(name: string, args: any, ctx: Record<string, unknown>) {
  const tool = getRuntimeToolPolicy(name);
  if (!tool) return { ok: false as const, error: `unknown tool ${name}` };
  if (name.startsWith("browser_")) {
    const norm = normalizeBrowserToolArgs(args, String(ctx.activeBrowserSessionId ?? "").trim());
    if (!norm.ok) return { ok: false as const, error: norm.error, args: norm.args };
    args = norm.args;
  }
  const resumePlan = (ctx.runtimeResumePlan && typeof ctx.runtimeResumePlan === "object") ? ctx.runtimeResumePlan as any : null;
  const completedActionHashes = Array.isArray(resumePlan?.completedActionHashes) ? resumePlan.completedActionHashes.map(String) : [];
  const actionHash = String(args.actionHash ?? "").trim();
  if (actionHash && completedActionHashes.includes(actionHash)) {
    return { ok: false as const, error: `Resume plan indicates actionHash ${actionHash} already completed; refusing duplicate side effect`, args, tool };
  }
  const argsKey = stableArgsKey(args);
  if (!tool.requiresApproval && argsKey) {
    const refs = Array.isArray(resumePlan?.completedToolRefs) ? resumePlan.completedToolRefs : [];
    const seen = refs.some((r: any) => String(r?.name ?? "") === name && String(r?.argsKey ?? "") === argsKey);
    if (seen) return { ok: false as const, error: `Resume plan indicates ${name} already completed for same args; refusing duplicate read`, args, tool, deduped: true as const, argsKey };
  }
  const executedActionHashes = Array.isArray(ctx.executedActionHashes) ? ctx.executedActionHashes.map(String) : [];
  if (actionHash && executedActionHashes.includes(actionHash)) {
    return { ok: false as const, error: `Executed actionHash ${actionHash} already recorded; refusing duplicate side effect`, args, tool, deduped: true as const, dedupeReason: "executed_action_hash" };
  }
  if (tool.requiresApproval) {
    const approvalId = String(args.approvalId ?? "").trim();
    const idempotencyKey = String(args.idempotencyKey ?? "").trim();
    if (!approvalId || !actionHash || !idempotencyKey) return { ok: false as const, error: `${name} requires approvalId, actionHash, and idempotencyKey`, args };
    const approvedHashes = Array.isArray(ctx.approvedActionHashes) ? ctx.approvedActionHashes.map(String) : [];
    const approvedKinds = Array.isArray(ctx.approvedActionKinds) ? ctx.approvedActionKinds.map(String) : [];
    const kindOk = approvedKinds.includes("external.high_risk") || approvedKinds.includes(`browser.${name.replace("browser_", "")}`);
    if (!kindOk || !approvedHashes.includes(actionHash)) return { ok: false as const, error: `${name} blocked: matching approved actionHash/kind required`, args };
  }
  return { ok: true as const, args, tool };
}

const BROWSER_TOOLS = RUNTIME_TOOL_REGISTRY.map(t => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));

export function isHighRiskPrompt(prompt: string): boolean {
  return /\b(buy|purchase|checkout|pay|payment|order|place order|submit|send email|delete|transfer|wire)\b/i.test(prompt);
}

export function hasApprovalForAction(ctx: Record<string, unknown>, actionKind = "external.high_risk"): boolean {
  if (ctx.approvalGranted === true) return true;
  const kinds = Array.isArray(ctx.approvedActionKinds) ? ctx.approvedActionKinds.map(String) : [];
  return kinds.includes(actionKind);
}

export function shouldExposeBrowserTools(input: AgentRuntimeInput): boolean {
  const ctx = (input.context ?? {}) as any;
  if (input.kind === "browser") return true;
  if (ctx.activeBrowserSessionId) return true;
  return /\b(browser|navigate|website|url|click|page|screenshot|snapshot|tab|dom|web)\b/i.test(input.prompt);
}

async function apiPost(path: string, body: unknown): Promise<any> {
  const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8787";
  const res = await fetch(`${apiUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-user-id": "usr_local_dev" }, body: JSON.stringify(body ?? {}) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function runTool(name: string, args: any): Promise<string> {
  if (name === "browser_navigate") {
    const sessionId = String(args.sessionId ?? "").trim(); const url = String(args.url ?? "").trim();
    if (!sessionId) return JSON.stringify({ error: "sessionId required for browser_navigate; no active browser session" });
    if (!url) return JSON.stringify({ error: "url required for browser_navigate" });
    const r = await apiPost(`/v1/browser/sessions/${sessionId}/navigate`, { url }); return JSON.stringify(r.json).slice(0, 4000);
  }
  if (name === "browser_snapshot") {
    const sessionId = String(args.sessionId ?? "").trim();
    if (!sessionId) return JSON.stringify({ error: "sessionId required for browser_snapshot; no active browser session" });
    const r = await apiPost(`/v1/browser/sessions/${sessionId}/snapshot`, {}); return JSON.stringify(r.json).slice(0, 4000);
  }
  if (name === "browser_click") {
    const sessionId = String(args.sessionId ?? "").trim();
    const approvalId = String(args.approvalId ?? ""); const actionHash = String(args.actionHash ?? ""); const idempotencyKey = String(args.idempotencyKey ?? "");
    if (!sessionId) return JSON.stringify({ error: "sessionId required for browser_click" });
    if (!approvalId || !actionHash || !idempotencyKey) return JSON.stringify({ error: "approvalId, actionHash, and idempotencyKey are required for browser_click" });
    const r = await apiPost(`/v1/browser/sessions/${sessionId}/click`, { selector: args.selector, approvalId, actionHash, idempotencyKey });
    return JSON.stringify(r.json).slice(0, 4000);
  }
  return JSON.stringify({ error: `unknown tool ${name}` });
}

export function normalizeBrowserToolArgs(args: any, activeSessionId = ""): { ok: true; args: any } | { ok: false; args: any; error: string } {
  const bad = (v: any) => !v || ["undefined","null","none"].includes(String(v).trim().toLowerCase());
  const out = { ...(args ?? {}) };
  if (bad(out.sessionId) && !bad(activeSessionId)) out.sessionId = activeSessionId;
  if (bad(out.sessionId)) return { ok: false, args: out, error: "No active browser session. Create/start a browser task first, then retry with a valid sessionId." };
  return { ok: true, args: out };
}
export function buildSystemPrompt(input: AgentRuntimeInput): string {
  const ctx = (input.context ?? {}) as any;
  const persona = String(ctx.persona ?? "You are Helm, a personal AI operator.");
  const facts = Array.isArray(ctx.memoryFacts) ? ctx.memoryFacts.slice(-8).map((f: any) => `- ${String(f)}`).join("\n") : "";
  const browser = ctx.activeBrowserSessionId ? `Active browser session: ${ctx.activeBrowserSessionId}.` : "No active browser session.";
  const resumePlan = ctx.runtimeResumePlan && typeof ctx.runtimeResumePlan === "object" ? ctx.runtimeResumePlan as any : null;
  const resume = resumePlan ? (() => {
    const boundary = typeof resumePlan.lastSafeBoundary === "string" ? resumePlan.lastSafeBoundary : "unknown";
    const refs = Array.isArray(resumePlan.completedToolRefs) ? resumePlan.completedToolRefs.slice(-8).map((r: any) => String(r?.name ?? "unknown")).filter(Boolean) : [];
    const hashes = Array.isArray(resumePlan.completedActionHashes) ? resumePlan.completedActionHashes.slice(-8).map(String) : [];
    const pending = resumePlan.pendingApproval?.actionHash ? String(resumePlan.pendingApproval.actionHash) : "";
    return `Resume checkpoint: boundary=${boundary}. Completed tool refs: ${refs.length ? refs.join(", ") : "none"}. Completed side-effect actionHashes: ${hashes.length ? hashes.join(", ") : "none"}.${pending ? ` Pending approval actionHash: ${pending}.` : ""} Do not repeat completed side-effect actions; continue from the last safe boundary.`;
  })() : "";
  const guardrails = [
    "Answer directly when no tool is required; do not use browser tools for normal questions.",
    "Only use browser tools when the user asks to browse/navigate/click/snapshot or an active browser session is relevant.",
    "If no active browser session exists and browser action is requested, ask to create a browser task or provide a sessionId; do not call browser tools with missing sessionId.",
    "Do not invent tool results, receipts, approval IDs, action hashes, or idempotency keys.",
    "For browser_click or any high-risk side effect, do not execute unless explicit approvalId, actionHash, and idempotencyKey are provided in context; otherwise explain that approval is required.",
    "Never claim an external action executed without a receipt.",
  ].join(" ");
  return `${persona}\n${guardrails}\n${browser}${facts ? `\nRelevant memory:\n${facts}` : ""}${resume ? `\n${resume}` : ""}`;
}

export function historyMessages(input: AgentRuntimeInput): ChatMsg[] {
  const fromThread = Array.isArray((input as any).thread) ? (input as any).thread : [];
  const ctx = (input.context ?? {}) as any;
  const fromCtx = Array.isArray(ctx.recentMessages) ? ctx.recentMessages : [];
  const rows = fromThread.length ? fromThread : fromCtx;
  return rows.slice(-12).flatMap((m: any) => {
    const role = m?.role;
    const content = String(m?.content ?? "").trim();
    if (!content) return [];
    if (role === "user" || role === "assistant") return [{ role, content } as ChatMsg];
    return [];
  });
}

async function* streamChat(input: AgentRuntimeInput, trace: Record<string, unknown>, cfg: ModelConfig, signal?: AbortSignal): AsyncIterable<AgentRuntimeEvent> {
  const messages: ChatMsg[] = [{ role: "system", content: buildSystemPrompt(input) }, ...historyMessages(input)];
  const last = messages[messages.length - 1];
  if (!(last?.role === "user" && last.content === input.prompt)) messages.push({ role: "user", content: input.prompt });
  let finalOutput = "";
  const tools = shouldExposeBrowserTools(input) ? BROWSER_TOOLS : [];
  for (let step = 0; step < 4; step++) {
    const body: any = { model: cfg.model, stream: true, messages, max_tokens: cfg.maxTokens };
    if (tools.length) { body.tools = tools; body.tool_choice = "auto"; }
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) }, body: JSON.stringify(body), signal: controller.signal });
    } catch (err) {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      const msg = err instanceof Error && err.name === "AbortError" ? (signal?.aborted ? "Runtime interrupted" : `Model request timed out after ${cfg.timeoutMs}ms`) : (err instanceof Error ? err.message : String(err));
      throw new Error(msg, { cause: err });
    }
    if (!res.ok || !res.body) { clearTimeout(timeout); signal?.removeEventListener("abort", onAbort); const text = await res.text().catch(() => ""); throw new Error(`Model request failed (${res.status}): ${redactModelError(text)}`, { cause: { status: res.status } }); }
    const reader = res.body.getReader(); const decoder = new TextDecoder(); let buf = ""; let content = ""; const toolCalls: any[] = [];
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break; buf += decoder.decode(value, { stream: true });
        let idx; while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data:")) continue; const data = line.slice(5).trim(); if (!data || data === "[DONE]") continue;
            try {
              const json = JSON.parse(data); const delta = json?.choices?.[0]?.delta;
              const textDelta = typeof delta?.content === "string" ? delta.content : "";
              if (textDelta) { content += textDelta; finalOutput += textDelta; yield { type: "runtime.response.delta", ts: now(), trace, message: "Model delta", payload: { delta: textDelta, provider: cfg.provider, model: cfg.model } }; }
              for (const tc of delta?.tool_calls ?? []) {
                const i = tc.index ?? 0; toolCalls[i] = toolCalls[i] ?? { id: tc.id ?? `call_${i}`, type: "function", function: { name: "", arguments: "" } };
                if (tc.id) toolCalls[i].id = tc.id;
                if (tc.function?.name) toolCalls[i].function.name += tc.function.name;
                if (tc.function?.arguments) toolCalls[i].function.arguments += tc.function.arguments;
              }
            } catch {}
          }
        }
      }
    } finally { clearTimeout(timeout); signal?.removeEventListener("abort", onAbort); }
    if (!toolCalls.length) { yield { type: "runtime.completed", ts: now(), trace, message: "Runtime completed", payload: { status: "succeeded", output: content.trim() || finalOutput.trim() || "Completed.", provider: cfg.provider, model: cfg.model } }; return; }
    messages.push({ role: "assistant", content, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      const name = tc.function?.name ?? "unknown";
      let args: any = {}; try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
      const policy = evaluateToolPolicy(name, args, (input.context ?? {}) as Record<string, unknown>);
      args = (policy as any).args ?? args;
      if (!policy.ok) {
        const deduped = Boolean((policy as any).deduped) || (typeof policy.error === "string" && policy.error.includes("already completed; refusing duplicate side effect"));
        const dedupeReason = (policy as any).dedupeReason ?? ((policy as any).deduped ? "resume_plan_completed_read_tool" : "resume_plan_completed_action_hash");
        const result = JSON.stringify({ error: policy.error });
        yield { type: "runtime.tool.completed", ts: now(), trace: { ...trace, tool: name }, message: `Tool ${name} blocked`, payload: { name, args: { actionHash: typeof args?.actionHash === "string" ? args.actionHash : undefined, idempotencyKey: typeof args?.idempotencyKey === "string" ? args.idempotencyKey : undefined }, argsKey: (policy as any).argsKey, result, policy: deduped ? "deduped" : "denied", actionHash: typeof args?.actionHash === "string" ? args.actionHash : undefined, idempotencyKey: typeof args?.idempotencyKey === "string" ? args.idempotencyKey : undefined } };
        if (deduped) {
          yield { type: "runtime.tool.deduped", ts: now(), trace: { ...trace, tool: name }, message: `Tool ${name} deduped by resume plan`, payload: { name, actionHash: typeof args?.actionHash === "string" ? args.actionHash : undefined, idempotencyKey: typeof args?.idempotencyKey === "string" ? args.idempotencyKey : undefined, argsKey: (policy as any).argsKey, reason: dedupeReason } };
        }
        messages.push({ role: "tool", tool_call_id: tc.id, name, content: result });
        continue;
      }
      yield { type: "runtime.tool.started", ts: now(), trace: { ...trace, tool: name }, message: `Calling ${name}`, payload: { name, args } };
      const result = await runTool(name, args);
      const argsKey = stableArgsKey(args);
      yield { type: "runtime.tool.completed", ts: now(), trace: { ...trace, tool: name }, message: `Tool ${name} completed`, payload: { name, args: { actionHash: typeof args?.actionHash === "string" ? args.actionHash : undefined, idempotencyKey: typeof args?.idempotencyKey === "string" ? args.idempotencyKey : undefined }, argsKey, result: result.slice(0, 2000) } };
      messages.push({ role: "tool", tool_call_id: tc.id, name, content: result });
    }
  }
  yield { type: "runtime.completed", ts: now(), trace, message: "Runtime completed", payload: { status: "succeeded", output: finalOutput.trim() || "Completed after tool steps.", provider: cfg.provider, model: cfg.model } };
}

export class HelmNativeRuntime implements AgentRuntime {
  readonly provider = "helm-native" as const;
  private readonly active = new Map<string, AbortController>();

  async interrupt(runId: string): Promise<void> {
    this.active.get(runId)?.abort();
  }

  async *run(input: AgentRuntimeInput): AsyncIterable<AgentRuntimeEvent> {
    const controller = new AbortController();
    this.active.set(input.runId, controller);
    try {
    if (input.kind === "browser") { for await (const evt of runBrowserTask(input)) yield evt; return; }
    const trace = { ...input.trace, taskId: input.taskId, runId: input.runId, userId: input.userId, agentId: "helm-native" };
    const ctx = (input.context ?? {}) as any;
    const override = ctx.modelOverride && typeof ctx.modelOverride === "object" ? ctx.modelOverride : undefined;
    const toolsExposed = shouldExposeBrowserTools(input);
    const sensitivity = ctx.modelSensitivity === "sensitive" || ctx.sensitivity === "sensitive" || ctx.sensitive === true || ctx.containsSensitiveData === true ? "sensitive" : undefined;
    const model = resolveModel(process.env, override, { taskKind: input.kind, toolCallingRequired: toolsExposed, sensitivity, prompt: input.prompt, context: ctx });
    yield { type: "runtime.started", ts: now(), trace, message: "Runtime started", payload: { provider: this.provider, kind: input.kind, model: model?.model ?? null, modelProvider: model?.provider ?? null, modelRoute: model?.policy.route ?? "fallback-no-model", modelSensitivity: model?.policy.sensitivity ?? (sensitivity ?? "normal"), modelSensitivitySource: model?.policy.sensitivitySource ?? (sensitivity ? "explicit" : "default"), modelWarnings: model?.policy.warnings ?? [] } };
    if (model?.policy.warnings.length) {
      yield { type: "runtime.planning", ts: now(), trace, message: "Model routing policy warnings", payload: { warnings: model.policy.warnings, reasons: model.policy.reasons, route: model.policy.route, selectedModel: model.model, selectedProvider: model.provider } };
    }
    yield { type: "runtime.planning", ts: now(), trace, message: "Planning task", payload: { prompt: input.prompt.slice(0, 500) } };
    const needsApproval = isHighRiskPrompt(input.prompt);
    const approved = hasApprovalForAction((input.context ?? {}) as Record<string, unknown>, "external.high_risk");
    if (needsApproval && !approved) {
      yield { type: "runtime.tool.proposed", ts: now(), trace: { ...trace, tool: "approval.request" }, message: "High-risk action requires approval", payload: { action: "external.high_risk", reason: "User prompt appears to request a high-risk/external action", approvalRequired: true, actionHash: randomUUID() } };
      yield { type: "runtime.completed", ts: now(), trace, message: "Waiting for approval", payload: { status: "waiting_approval", output: "Planned. High-risk action detected; waiting for explicit approval before external side effects." } };
      return;
    }
    if (model) {
      if (!model.policy.egressAllowed) {
        yield { type: "runtime.failed", ts: now(), trace, message: "Sensitive egress policy blocked model routing", payload: { code: "POLICY_DENIED", retryable: false, provider: model.provider, model: model.model, policy: model.policy, guardrail: "sensitive_egress" } };
        return;
      }
      if (toolsExposed && !isToolCapableModel(model)) {
        yield { type: "runtime.completed", ts: now(), trace, message: "Model not tool-capable allowlisted", payload: { status: "succeeded", output: `Configured model '${model.model}' is not in the local tool-capable allowlist. Set HELM_MODEL to an allowlisted tool-capable model (current allowlist: ${model.allowlist.join(", ")}) or update HELM_MODEL_TOOL_CAPABLE_ALLOWLIST after verifying tool-call reliability.` , provider: model.provider, model: model.model, guardrail: "tool_capability_allowlist", policy: model.policy } };
        return;
      }
      if (!toolsExposed && model.provider === "ollama" && !isToolCapableModel(model)) {
        yield { type: "runtime.planning", ts: now(), trace, message: "Model not tool-capable allowlisted; continuing without browser tools", payload: { provider: model.provider, model: model.model, guardrail: "tool_capability_allowlist_non_tool_path", policy: model.policy } };
      }
      try { for await (const evt of streamChat(input, trace, model, controller.signal)) yield evt; return; }
      catch (err) {
        if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
          yield { type: "runtime.interrupted", ts: now(), trace, message: "Runtime interrupted", payload: { reason: "interrupted", provider: model.provider, model: model.model, policy: model.policy } };
          return;
        }
        const message = redactModelError(err instanceof Error ? err.message : String(err)); yield { type: "runtime.failed", ts: now(), trace, message, payload: { code: "MODEL_ERROR", retryable: true, provider: model.provider, model: model.model, policy: model.policy } }; return;
      }
    }
    yield { type: "runtime.completed", ts: now(), trace, message: "Runtime completed", payload: { status: "succeeded", output: approved ? "Approval granted. Helm-native MVP recorded approval; external execution adapter not yet enabled for this action." : "Planned and completed in Helm-native MVP runtime. Configure HELM_MODEL/HELM_MODEL_BASE_URL (or OPENAI_API_KEY) for real model responses." } };
  } finally {
      this.active.delete(input.runId);
    }
  }

  static toResult(events: AgentRuntimeEvent[]): AgentRuntimeResult {
    const failed = [...events].reverse().find((e) => e.type === "runtime.failed");
    if (failed) return { status: "failed", error: { code: "RUNTIME_FAILED", message: failed.message ?? "Runtime failed", retryable: true } };
    const interrupted = events.some((e) => e.type === "runtime.interrupted");
    if (interrupted) return { status: "cancelled", output: "Runtime interrupted" };
    const completed = [...events].reverse().find((e) => e.type === "runtime.completed");
    const status = String(completed?.payload.status ?? "succeeded") as AgentRuntimeResult["status"];
    const output = String(completed?.payload.output ?? "Completed");
    return { status: status === "waiting_approval" ? "waiting_approval" : status === "waiting_input" ? "waiting_input" : status === "failed" ? "failed" : status === "cancelled" ? "cancelled" : "succeeded", output, result: { events: events.length } };
  }
}
