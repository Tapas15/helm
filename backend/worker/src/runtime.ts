import { randomUUID } from "node:crypto";
import type { AgentRuntime, AgentRuntimeEvent, AgentRuntimeInput, AgentRuntimeResult } from "@helm/shared";
import { runBrowserTask } from "./browserTask.js";

const now = () => new Date().toISOString();

type ModelConfig = { baseUrl: string; apiKey?: string; model: string; provider: string };
type ChatMsg = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: any[]; name?: string };

function resolveModel(): ModelConfig | null {
  const model = process.env.HELM_MODEL ?? process.env.OPENAI_MODEL ?? (process.env.OLLAMA_BASE_URL ? "llama3.2" : "");
  const apiKey = process.env.HELM_MODEL_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  const baseUrl = (process.env.HELM_MODEL_BASE_URL ?? process.env.OPENAI_BASE_URL ?? (process.env.OLLAMA_BASE_URL ? `${process.env.OLLAMA_BASE_URL}/v1` : "")).replace(/\/$/, "");
  if (!model || !baseUrl) return null;
  const provider = process.env.HELM_MODEL_PROVIDER ?? (baseUrl.includes("11434") || process.env.OLLAMA_BASE_URL ? "ollama" : "openai-compatible");
  return { baseUrl, apiKey: apiKey || undefined, model, provider };
}

const TOOLS = [
  { type: "function", function: { name: "browser_navigate", description: "Navigate an existing browser session to a URL. Low-risk observation/navigation.", parameters: { type: "object", properties: { sessionId: { type: "string" }, url: { type: "string" } }, required: ["sessionId", "url"] } } },
  { type: "function", function: { name: "browser_snapshot", description: "Capture a text snapshot of current browser page.", parameters: { type: "object", properties: { sessionId: { type: "string" } }, required: ["sessionId"] } } },
  { type: "function", function: { name: "browser_click", description: "Click selector in browser. High-risk side effect: requires approved approvalId/actionHash/idempotencyKey.", parameters: { type: "object", properties: { sessionId: { type: "string" }, selector: { type: "string" }, approvalId: { type: "string" }, actionHash: { type: "string" }, idempotencyKey: { type: "string" } }, required: ["sessionId", "selector", "approvalId", "actionHash", "idempotencyKey"] } } },
];

async function apiPost(path: string, body: unknown): Promise<any> {
  const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8787";
  const res = await fetch(`${apiUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-user-id": "usr_local_dev" }, body: JSON.stringify(body ?? {}) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function runTool(name: string, args: any): Promise<string> {
  if (name === "browser_navigate") { const r = await apiPost(`/v1/browser/sessions/${args.sessionId}/navigate`, { url: args.url }); return JSON.stringify(r.json).slice(0, 4000); }
  if (name === "browser_snapshot") { const r = await apiPost(`/v1/browser/sessions/${args.sessionId}/snapshot`, {}); return JSON.stringify(r.json).slice(0, 4000); }
  if (name === "browser_click") { const r = await apiPost(`/v1/browser/sessions/${args.sessionId}/click`, { selector: args.selector, approvalId: args.approvalId, actionHash: args.actionHash, idempotencyKey: args.idempotencyKey }); return JSON.stringify(r.json).slice(0, 4000); }
  return JSON.stringify({ error: `unknown tool ${name}` });
}

function buildSystemPrompt(input: AgentRuntimeInput): string {
  const ctx = (input.context ?? {}) as any;
  const persona = String(ctx.persona ?? "You are Helm, a personal AI operator.");
  const facts = Array.isArray(ctx.memoryFacts) ? ctx.memoryFacts.slice(-8).map((f: any) => `- ${String(f)}`).join("\n") : "";
  const browser = ctx.activeBrowserSessionId ? `Active browser session: ${ctx.activeBrowserSessionId}.` : "No active browser session.";
  return `${persona}\nBe concise, actionable, and safe. For browser side effects, request/require approval and include approvalId/actionHash/idempotencyKey when calling guarded tools. Never claim an external action executed without a receipt.\n${browser}${facts ? `\nRelevant memory:\n${facts}` : ""}`;
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
  for (let step = 0; step < 4; step++) {
    const body = { model: cfg.model, stream: true, messages, tools: TOOLS, tool_choice: "auto" };
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) }, body: JSON.stringify(body) });
    if (!res.ok || !res.body) { const text = await res.text().catch(() => ""); throw new Error(`Model request failed (${res.status}): ${text.slice(0, 300)}`); }
    const reader = res.body.getReader(); const decoder = new TextDecoder(); let buf = ""; let content = ""; const toolCalls: any[] = [];
    while (true) {
      const { value, done } = await reader.read(); if (done) break; buf += decoder.decode(value, { stream: true });
      let idx; while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue; const data = line.slice(5).trim(); if (!data || data === "[DONE]") continue;
          try {
            const json = JSON.parse(data); const delta = json?.choices?.[0]?.delta;
            const textDelta = delta?.content ?? "";
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
    if (!toolCalls.length) { yield { type: "runtime.completed", ts: now(), trace, message: "Runtime completed", payload: { status: "succeeded", output: content.trim() || finalOutput.trim() || "Completed.", provider: cfg.provider, model: cfg.model } }; return; }
    messages.push({ role: "assistant", content, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      const name = tc.function?.name ?? "unknown";
      let args: any = {}; try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
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
      try { for await (const evt of streamChat(input, trace, model)) yield evt; return; }
      catch (err) { const message = err instanceof Error ? err.message : String(err); yield { type: "runtime.failed", ts: now(), trace, message, payload: { code: "MODEL_ERROR", retryable: true, provider: model.provider, model: model.model } }; return; }
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
