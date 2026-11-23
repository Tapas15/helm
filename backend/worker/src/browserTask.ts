import type { AgentRuntimeEvent, AgentRuntimeInput } from "@helm/shared";

const browserUrl = process.env.BROWSER_WORKER_URL ?? "http://127.0.0.1:8790";
const browserToken = process.env.BROWSER_WORKER_TOKEN ?? "dev-browser-token";
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8787";
const now = () => new Date().toISOString();

async function bw(path: string, body?: unknown, method = "POST") {
  const res = await fetch(`${browserUrl}${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${browserToken}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error?.message ?? `browser-worker ${res.status}`);
  return json as any;
}
async function api(path: string, body?: unknown, userId = "usr_local_dev") {
  const res = await fetch(`${apiUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-user-id": userId }, body: JSON.stringify(body ?? {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error?.message ?? `api ${res.status}`);
  return json as any;
}
async function getSession(sessionId: string) {
  const res = await fetch(`${browserUrl}/v1/sessions/${sessionId}`, { headers: { authorization: `Bearer ${browserToken}` } });
  if (!res.ok) return null;
  return (await res.json().catch(() => null))?.session ?? null;
}

export async function* runBrowserTask(input: AgentRuntimeInput): AsyncIterable<AgentRuntimeEvent> {
  const trace = { ...input.trace, taskId: input.taskId, runId: input.runId, userId: input.userId, agentId: "helm-native" };
  const ctx = (input.context as any) ?? {};
  const approvedKinds: string[] = Array.isArray(ctx.approvedActionKinds) ? ctx.approvedActionKinds : [];
  const approved = Boolean(ctx.approvalGranted) || approvedKinds.includes("browser.external");
  const approvedHash = String(ctx.approvedActionHash ?? "");
  const approvalId = String(ctx.approvalId ?? "");
  const highRisk = /\b(buy|purchase|checkout|pay|payment|order|place order|submit)\b/i.test(input.prompt);
  const requestedSessionId = String(ctx.activeBrowserSessionId ?? "");

  yield { type: "runtime.started", ts: now(), trace, message: "Browser runtime started", payload: { provider: "helm-native", kind: "browser" } };
  yield { type: "runtime.planning", ts: now(), trace, message: "Planning browser task", payload: { prompt: input.prompt.slice(0, 500) } };

  if (highRisk && !approved) {
    yield { type: "runtime.tool.proposed", ts: now(), trace: { ...trace, tool: "approval.request" }, message: "High-risk browser action requires approval", payload: { action: "browser.external", reason: "Purchase/submit actions require explicit approval", approvalRequired: true, actionHash: crypto.randomUUID(), idempotencyScope: { taskId: input.taskId, action: "browser.external" } } };
    yield { type: "runtime.completed", ts: now(), trace, message: "Waiting for approval", payload: { status: "waiting_approval", output: "Browser task paused before high-risk action. Approve to continue." } };
    return;
  }

  let sessionId = requestedSessionId;
  if (sessionId) {
    const existing = await getSession(sessionId);
    if (existing) yield { type: "runtime.tool.completed", ts: now(), trace: { ...trace, tool: "browser.session.resume", sessionId }, message: "Resumed existing browser session", payload: { sessionId, url: existing.currentUrl, control: existing.control } };
    else sessionId = "";
  }
  if (!sessionId) {
    const session = await bw("/v1/sessions", { taskId: input.taskId, runId: input.runId, headless: true, initialUrl: "https://example.com" });
    sessionId = session.session?.id;
    yield { type: "runtime.tool.started", ts: now(), trace: { ...trace, tool: "browser.session.create", sessionId }, message: "Browser session created", payload: { sessionId, url: session.session?.currentUrl } };
  }

  const nav = await bw(`/v1/sessions/${sessionId}/navigate`, { url: "https://example.com" });
  yield { type: "runtime.tool.completed", ts: now(), trace: { ...trace, tool: "browser.navigate", sessionId }, message: "Navigated", payload: { url: nav.url, title: nav.title } };

  const afterNav = await getSession(sessionId);
  if (afterNav?.control?.owner === "user" || afterNav?.status === "takeover") {
    yield { type: "runtime.takeover.requested", ts: now(), trace: { ...trace, sessionId }, message: "Browser session is under user takeover", payload: { sessionId, control: afterNav.control } };
    yield { type: "runtime.completed", ts: now(), trace, message: "Waiting for user takeover", payload: { status: "waiting_input", output: "Browser task paused for user takeover. Resume agent when ready.", sessionId } };
    return;
  }

  const snap = await bw(`/v1/sessions/${sessionId}/snapshot`, {});
  yield { type: "runtime.tool.completed", ts: now(), trace: { ...trace, tool: "browser.snapshot", sessionId }, message: "Captured snapshot", payload: { title: snap.title, text: String(snap.data?.text ?? "").slice(0, 500), artifact: snap.data?.artifact } };

  const shot = await bw(`/v1/sessions/${sessionId}/screenshot`, { fullPage: false });
  yield { type: "runtime.tool.completed", ts: now(), trace: { ...trace, tool: "browser.screenshot", sessionId }, message: "Captured screenshot", payload: { mime: shot.data?.mime, base64Len: String(shot.data?.base64 ?? "").length, artifact: shot.data?.artifact } };

  if (highRisk && approved) {
    if (!approvalId || !approvedHash) throw new Error("Approved high-risk action missing approvalId/actionHash");
    const idempotencyKey = `task:${input.taskId}:action:${approvedHash}`;
    const ext = await api(`/v1/browser/sessions/${sessionId}/external-action`, { action: "purchase", actionHash: approvedHash, idempotencyKey, approvalId, metadata: { prompt: input.prompt.slice(0, 200) } }, input.userId);
    yield { type: "runtime.tool.completed", ts: now(), trace: { ...trace, tool: "browser.external_action", sessionId }, message: "Executed guarded external action", payload: { ...ext.data, sessionId } };
  }

  yield { type: "runtime.completed", ts: now(), trace, message: "Browser task completed", payload: { status: "succeeded", output: approved ? "Approved browser task completed through guarded external-action path with evidence capture." : "Browser task completed with evidence capture. Session kept open for preview/takeover.", sessionId, artifacts: [snap.data?.artifact, shot.data?.artifact].filter(Boolean) } };
}
