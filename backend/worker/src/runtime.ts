import { randomUUID } from "node:crypto";
import type { AgentRuntime, AgentRuntimeEvent, AgentRuntimeInput, AgentRuntimeResult } from "@helm/shared";
import { runBrowserTask } from "./browserTask.js";

const now = () => new Date().toISOString();

type ModelConfig = { baseUrl: string; apiKey?: string; model: string; provider: string; timeoutMs: number; maxTokens: number; allowlist: string[] };
type ChatMsg = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: any[]; name?: string };

const DEFAULT_TOOL_CAPABLE_ALLOWLIST = ["llama3.2:latest", "llama3.2:3b", "qwen2.5:latest", "qwen2.5:3b"];

function resolveModel(): ModelConfig | null {
  const model = process.env.HELM_MODEL ?? process.env.OPENAI_MODEL ?? (process.env.OLLAMA_BASE_URL ? "llama3.2:latest" : "");
  const apiKey = process.env.HELM_MODEL_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  const baseUrl = (process.env.HELM_MODEL_BASE_URL ?? process.env.OPENAI_BASE_URL ?? (process.env.OLLAMA_BASE_URL ? `${process.env.OLLAMA_BASE_URL}/v1` : "")).replace(/\/$/, "");
  if (!model || !baseUrl) return null;
  const provider = process.env.HELM_MODEL_PROVIDER ?? (baseUrl.includes("11434") || process.env.OLLAMA_BASE_URL ? "ollama" : "openai-compatible");
  const timeoutMs = Math.max(5000, Number(process.env.HELM_MODEL_TIMEOUT_MS ?? 120000));
  const maxTokens = Math.max(128, Number(process.env.HELM_MODEL_MAX_TOKENS ?? 1024));
  const allowlist = (process.env.HELM_MODEL_TOOL_CAPABLE_ALLOWLIST ?? DEFAULT_TOOL_CAPABLE_ALLOWLIST.join(",")).split(",").map(s => s.trim()).filter(Boolean);
  return { baseUrl, apiKey: apiKey || undefined, model, provider, timeoutMs, maxTokens, allowlist };
}

function isToolCapableModel(cfg: ModelConfig): boolean {
  if (cfg.provider !== "ollama") return true;
  return cfg.allowlist.some(m => m.toLowerCase() === cfg.model.toLowerCase());
}

function redactModelError(text: string): string {
  return text.replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer [redacted]").slice(0, 300);
}

const BROWSER_TOOLS = [
  { type: "function", function: { name: "browser_navigate", description: "Navigate an existing browser session to a URL. Low-risk observation/navigation.", parameters: { type: "object", properties: { sessionId: { type: "string" }, url: { type: "string" } }, required: ["sessionId", "url"] } } },
  { type: "function", function: { name: "browser_snapshot", description: "Capture a text snapshot of current browser page.", parameters: { type: "object", properties: { sessionId: { type: "string" } }, required: ["sessionId"] } } },
  { type: "function", function: { name: "browser_click", description: "Click selector in browser. High-risk side effect: requires approved approvalId/actionHash/idempotencyKey.", parameters: { type: "object", properties: { sessionId: { type: "string" }, selector: { type: "string" }, approvalId: { type: "string" }, actionHash: { type: "string" }, idempotencyKey: { type: "string" } }, required: ["sessionId", "selector", "approvalId", "actionHash", "idempotencyKey"] } } },
];

function shouldExposeBrowserTools(input: AgentRuntimeInput): boolean {
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

function buildSystemPrompt(input: AgentRuntimeInput): string {
  const ctx = (input.context ?? {}) as any;
  const persona = String(ctx.persona ?? "You are Helm, a personal AI operator.");
  const facts = Array.isArray(ctx.memoryFacts) ? ctx.memoryFacts.slice(-8).map((f: any) => `- ${String(f)}`).join("\n") : "";
  const browser = ctx.activeBrowserSessionId ? `Active browser session: ${ctx.activeBrowserSessionId}.` : "No active browser session.";
  const guardrails = [
    "Answer directly when no tool is required; do not use browser tools for normal questions.",
    "Only use browser tools when the user asks to browse/navigate/click/snapshot or an active browser session is relevant.",
    "If no active browser session exists and browser action is requested, ask to create a browser task or provide a sessionId; do not call browser tools with missing sessionId.",
    "Do not invent tool results, receipts, approval IDs, action hashes, or idempotency keys.",
    "For browser_click or any high-risk side effect, do not execute unless explicit approvalId, actionHash, and idempotencyKey are provided in context; otherwise explain that approval is required.",
    "Never claim an external action executed without a receipt.",
  ].join(" ");
  return `${persona}\n${guardrails}\n${browser}${facts ? `\nRelevant memory:\n${facts}` : ""}`;
}

function historyMessages(input: AgentRuntimeInput): ChatMsg[] {
  const ctx = (input.context ?? {}) as any;
  const rows = Array.isArray(ctx.recentMessages) ? ctx.recentMessages : [];
  return rows.slice(-12).flatMap((m: any) => {
    const role = m?.role;
    const content = String(m?.content ?? "").trim();
    if (!content) return [];
    if (role === "user" || role === "assistant") return [{ role, content } as ChatMsg];
    return [];
  });
}

async function* streamChat(input: AgentRuntimeInput, trace: Record<string, unknown>, cfg: ModelConfig): AsyncIterable<AgentRuntimeEvent> {
  const messages: ChatMsg[] = [{ role: "system", content: buildSystemPrompt(input) }, ...historyMessages(input)];
  const last = messages[messages.length - 1];
  if (!(last?.role === "user" && last.content === input.prompt)) messages.push({ role: "user", content: input.prompt });
  let finalOutput = "";
  const tools = shouldExposeBrowserTools(input) ? BROWSER_TOOLS : [];
  for (let step = 0; step < 4; step++) {
    const body: any = { model: cfg.model, stream: true, messages, max_tokens: cfg.maxTokens };
    if (tools.length) { body.tools = tools; body.tool_choice = "auto"; }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) }, body: JSON.stringify(body), signal: controller.signal });
    } catch (err) {
      clearTimeout(timeout);
      const msg = err instanceof Error && err.name === "AbortError" ? `Model request timed out after ${cfg.timeoutMs}ms` : (err instanceof Error ? err.message : String(err));
      throw new Error(msg);
    }
    if (!res.ok || !res.body) { clearTimeout(timeout); const text = await res.text().catch(() => ""); throw new Error(`Model request failed (${res.status}): ${redactModelError(text)}`); }
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
    } finally { clearTimeout(timeout); }
    if (!toolCalls.length) { yield { type: "runtime.completed", ts: now(), trace, message: "Runtime completed", payload: { status: "succeeded", output: content.trim() || finalOutput.trim() || "Completed.", provider: cfg.provider, model: cfg.model } }; return; }
    messages.push({ role: "assistant", content, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      const name = tc.function?.name ?? "unknown";
      let args: any = {}; try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
      if (name.startsWith("browser_")) {
        const bad = (v: any) => !v || ["undefined","null","none"].includes(String(v).trim().toLowerCase());
        if (bad(args.sessionId)) {
          const active = String((input.context as any)?.activeBrowserSessionId ?? "").trim();
          if (!bad(active)) args.sessionId = active;
        }
        if (bad(args.sessionId)) {
          const result = JSON.stringify({ error: "No active browser session. Create/start a browser task first, then retry with a valid sessionId." });
          yield { type: "runtime.tool.started", ts: now(), trace: { ...trace, tool: name }, message: `Calling ${name}`, payload: { name, args } };
          yield { type: "runtime.tool.completed", ts: now(), trace: { ...trace, tool: name }, message: `Tool ${name} blocked`, payload: { name, result } };
          messages.push({ role: "tool", tool_call_id: tc.id, name, content: result });
          continue;
        }
      }
      yield { type: "runtime.tool.started", ts: now(), trace: { ...trace, tool: name }, message: `Calling ${name}`, payload: { name, args } };
      const result = await runTool(name, args);
      yield { type: "runtime.tool.completed", ts: now(), trace: { ...trace, tool: name }, message: `Tool ${name} completed`, payload: { name, result: result.slice(0, 2000) } };
      messages.push({ role: "tool", tool_call_id: tc.id, name, content: result });
    }
  }
  yield { type: "runtime.completed", ts: now(), trace, message: "Runtime completed", payload: { status: "succeeded", output: finalOutput.trim() || "Completed after tool steps.", provider: cfg.provider, model: cfg.model } };
}

export class HelmNativeRuntime implements AgentRuntime {
  readonly provider = "helm-native" as const;

  async *run(input: AgentRuntimeInput): AsyncIterable<AgentRuntimeEvent> {
    if (input.kind === "browser") { for await (const evt of runBrowserTask(input)) yield evt; return; }
    const trace = { ...input.trace, taskId: input.taskId, runId: input.runId, userId: input.userId, agentId: "helm-native" };
    const model = resolveModel();
    yield { type: "runtime.started", ts: now(), trace, message: "Runtime started", payload: { provider: this.provider, kind: input.kind, model: model?.model ?? null, modelProvider: model?.provider ?? null } };
    yield { type: "runtime.planning", ts: now(), trace, message: "Planning task", payload: { prompt: input.prompt.slice(0, 500) } };
    const needsApproval = /\b(buy|purchase|checkout|pay|payment|order|place order|submit|send email|delete)\b/i.test(input.prompt);
    const approved = Boolean((input.context as any)?.approvalGranted) || (Array.isArray((input.context as any)?.approvedActionKinds) && (input.context as any).approvedActionKinds.includes("external.high_risk"));
    if (needsApproval && !approved) {
      yield { type: "runtime.tool.proposed", ts: now(), trace: { ...trace, tool: "approval.request" }, message: "High-risk action requires approval", payload: { action: "external.high_risk", reason: "User prompt appears to request a high-risk/external action", approvalRequired: true, actionHash: randomUUID() } };
      yield { type: "runtime.completed", ts: now(), trace, message: "Waiting for approval", payload: { status: "waiting_approval", output: "Planned. High-risk action detected; waiting for explicit approval before external side effects." } };
      return;
    }
    if (model) {
      if (!isToolCapableModel(model)) {
        yield { type: "runtime.completed", ts: now(), trace, message: "Model not tool-capable allowlisted", payload: { status: "succeeded", output: `Configured model '${model.model}' is not in the local tool-capable allowlist. Set HELM_MODEL to an allowlisted tool-capable model (current allowlist: ${model.allowlist.join(", ")}) or update HELM_MODEL_TOOL_CAPABLE_ALLOWLIST after verifying tool-call reliability.` , provider: model.provider, model: model.model, guardrail: "tool_capability_allowlist" } };
        return;
      }
      try { for await (const evt of streamChat(input, trace, model)) yield evt; return; }
      catch (err) { const message = redactModelError(err instanceof Error ? err.message : String(err)); yield { type: "runtime.failed", ts: now(), trace, message, payload: { code: "MODEL_ERROR", retryable: true, provider: model.provider, model: model.model } }; return; }
    }
    yield { type: "runtime.completed", ts: now(), trace, message: "Runtime completed", payload: { status: "succeeded", output: approved ? "Approval granted. Helm-native MVP recorded approval; external execution adapter not yet enabled for this action." : "Planned and completed in Helm-native MVP runtime. Configure HELM_MODEL/HELM_MODEL_BASE_URL (or OPENAI_API_KEY) for real model responses." } };
  }

  async interrupt(_runId: string): Promise<void> {}
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
