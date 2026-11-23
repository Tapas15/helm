import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTaskEventStream } from "./useTaskEventStream";

type Task = { id: string; title: string; prompt: string; status: string; kind: string; createdAt: string; updatedAt: string; result: unknown; errorMessage: string | null; };
type Approval = { id: string; taskId: string; runId: string | null; actionKind: string; actionHash: string; status: string; summary: string; evidence: unknown; requestedAt: string; resolvedAt: string | null; decisionReason: string | null };
type BrowserSession = { id: string; provider: string; status: string; taskId: string | null; runId: string | null; currentUrl: string | null; title: string | null; updatedAt: string; control?: { owner: "agent" | "user"; takeoverReason: string | null }; lastScreenshotAt?: string | null };
type Artifact = { id: string; taskId: string; sessionId: string; kind: string; path: string; mime: string; sha256: string; sizeBytes: number; createdAt: string; metadata: unknown };
type Receipt = { id: string; taskId: string; actionKind: string; actionHash: string; idempotencyKey: string; status: string; createdAt: string; approvalId: string | null; evidence: unknown };
type Msg = { id: string; taskId: string; role: "user" | "assistant" | "system" | "tool"; content: string; createdAt: string; metadata?: unknown };
type Me = { auth: { userId: string; method: string; sessionId: string | null } };

const TOKEN_KEY = "helm_auth_token";
const DEV_USER_KEY = "helm_dev_user_id";
const getToken = () => localStorage.getItem(TOKEN_KEY) ?? "";
const setToken = (t: string) => { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); };
const getDevUser = () => localStorage.getItem(DEV_USER_KEY) ?? "usr_local_dev";
const setDevUser = (v: string) => localStorage.setItem(DEV_USER_KEY, v);

export function App() {
  const qc = useQueryClient();
  const [token, setTokenState] = useState(getToken());
  const [devUser, setDevUserState] = useState(getDevUser());
  const [loginUser, setLoginUser] = useState(getDevUser());
  const [authError, setAuthError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<"assistant" | "browser">("assistant");
  const [previewTick, setPreviewTick] = useState(0);
  const [takeoverReason, setTakeoverReason] = useState("Need manual CAPTCHA/OTP/login");
  const [liveFrame, setLiveFrame] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<"idle" | "connecting" | "live" | "offline">("idle");
  const [remoteText, setRemoteText] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    else if (devUser) h["x-user-id"] = devUser;
    return h;
  }, [token, devUser]);

  const api = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) } });
    if (res.status === 401) {
      setToken("");
      setTokenState("");
      qc.clear();
      throw new Error("Authentication required");
    }
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<T>;
  }, [authHeaders, qc]);

  const meQ = useQuery({ queryKey: ["me", token, devUser], queryFn: () => api<Me>("/v1/auth/me"), retry: false });

  const login = useMutation({
    mutationFn: async () => {
      const res = await fetch("/v1/auth/sessions", {
        method: "POST",
        headers: { "content-type": "application/json", ...(devUser ? { "x-user-id": devUser } : {}) },
        body: JSON.stringify({ userId: loginUser || devUser, ttlHours: 24 * 7 }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? `Login failed (${res.status})`);
      return json as { token: string };
    },
    onSuccess: (d) => { setToken(d.token); setTokenState(d.token); setAuthError(null); qc.invalidateQueries(); },
    onError: (e) => setAuthError(e instanceof Error ? e.message : String(e)),
  });

  const logout = () => { setToken(""); setTokenState(""); qc.clear(); setSelected(null); };

  const tasksQ = useQuery({ queryKey: ["tasks", token, devUser], queryFn: () => api<{ tasks: Task[] }>("/v1/tasks"), enabled: meQ.isSuccess, refetchInterval: 5000 });
  const approvalsQ = useQuery({ queryKey: ["approvals", token, devUser], queryFn: () => api<{ approvals: Approval[] }>("/v1/approvals?status=pending"), enabled: meQ.isSuccess, refetchInterval: 5000 });
  const browserQ = useQuery({ queryKey: ["browser-sessions", token, devUser], queryFn: () => api<{ sessions: BrowserSession[] }>("/v1/browser/sessions"), enabled: meQ.isSuccess, refetchInterval: 3000 });
  const artifactsQ = useQuery({ queryKey: ["artifacts", selected, token, devUser], queryFn: () => api<{ artifacts: Artifact[] }>(selected ? `/v1/artifacts?taskId=${selected}` : "/v1/artifacts"), enabled: meQ.isSuccess, refetchInterval: 5000 });
  const receiptsQ = useQuery({ queryKey: ["receipts", selected, token, devUser], queryFn: () => api<{ receipts: Receipt[] }>(selected ? `/v1/receipts?taskId=${selected}` : "/v1/receipts"), enabled: meQ.isSuccess, refetchInterval: 5000 });
  const messagesQ = useQuery({ queryKey: ["messages", selected, token, devUser], queryFn: () => api<{ messages: Msg[] }>(`/v1/tasks/${selected}/messages`), enabled: !!selected && meQ.isSuccess, refetchInterval: 4000 });
  const { events, stale, lastSequence } = useTaskEventStream(meQ.isSuccess ? selected : null, token);
  useEffect(() => { const t = window.setInterval(() => setPreviewTick((n) => n + 1), 2500); return () => window.clearInterval(t); }, []);

  const send = useMutation({
    mutationFn: async (p: string) => {
      if (selected && current && !["running", "planning"].includes(current.status)) {
        return api<{ task: Task }>(`/v1/tasks/${selected}/messages`, { method: "POST", body: JSON.stringify({ content: p }) });
      }
      return api<{ task: Task }>("/v1/tasks", { method: "POST", body: JSON.stringify({ prompt: p, kind }) });
    },
    onSuccess: (d) => { setPrompt(""); setSelected(d.task.id); qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["messages", d.task.id] }); },
  });
  const control = useMutation({ mutationFn: (args: { id: string; action: string }) => api(`/v1/tasks/${args.id}/control`, { method: "POST", body: JSON.stringify({ action: args.action }) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["approvals"] }); } });
  const resolveApproval = useMutation({ mutationFn: (args: { id: string; decision: "approve" | "reject"; reason?: string }) => api(`/v1/approvals/${args.id}/resolve`, { method: "POST", body: JSON.stringify({ decision: args.decision, reason: args.reason }) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["approvals"] }); qc.invalidateQueries({ queryKey: ["receipts"] }); } });
  const takeover = useMutation({ mutationFn: (args: { id: string; reason: string }) => api(`/v1/browser/sessions/${args.id}/takeover/request`, { method: "POST", body: JSON.stringify({ reason: args.reason }) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["browser-sessions"] }); qc.invalidateQueries({ queryKey: ["tasks"] }); } });
  const resumeAgent = useMutation({ mutationFn: (args: { id: string }) => api(`/v1/browser/sessions/${args.id}/takeover/resume`, { method: "POST", body: JSON.stringify({ note: "User resumed agent" }) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["browser-sessions"] }); qc.invalidateQueries({ queryKey: ["tasks"] }); } });

  const tasks = tasksQ.data?.tasks ?? [];
  const current = tasks.find((t) => t.id === selected) ?? null;
  const pendingApprovals = (approvalsQ.data?.approvals ?? []).filter((a) => !selected || a.taskId === selected);
  const sessionFromEvents = [...events].reverse().map((e) => { const p = e.payload as any; return p?.sessionId ?? p?.trace?.sessionId; }).find((v): v is string => typeof v === "string" && v.startsWith("bs_"));
  const browserSessions = browserQ.data?.sessions ?? [];
  const currentSession = browserSessions.find((s) => s.id === sessionFromEvents) ?? browserSessions.find((s) => s.taskId === selected) ?? browserSessions[0] ?? null;
  const artifacts = (artifactsQ.data?.artifacts ?? []).slice(0, 8);
  const receipts = (receiptsQ.data?.receipts ?? []).slice(0, 8);
  const messages = messagesQ.data?.messages ?? [];
  const streamingDelta = events.filter((e) => e.type === "runtime.response.delta").map((e) => String((e.payload as any)?.delta ?? "")).join("");
  const completedOutput = [...events].reverse().find((e) => e.type === "runtime.completed" || e.type === "task.completed");
  const completedText = typeof (completedOutput?.payload as any)?.output === "string" ? String((completedOutput?.payload as any).output) : "";
  const hasAssistantMsg = messages.some((m) => m.role === "assistant");
  const showLiveAssistant = !!current && !hasAssistantMsg && (streamingDelta.length > 0 || ["queued","running","planning","waiting_approval","waiting_input"].includes(current.status));
  const toolCards = events.filter((e) => ["runtime.tool.started","runtime.tool.completed","runtime.tool.proposed","runtime.approval.requested","browser.takeover.requested","browser.takeover.resumed"].includes(e.type)).slice(-8);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, streamingDelta.length, selected]);

  useEffect(() => {
    wsRef.current?.close(); setLiveFrame(null);
    if (!currentSession?.id) { setStreamStatus("idle"); return; }
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = new URL(`${proto}://${window.location.host}/v1/browser/sessions/${currentSession.id}/stream`);
    if (token) wsUrl.searchParams.set("token", token);
    const ws = new WebSocket(wsUrl.toString());
    wsRef.current = ws; setStreamStatus("connecting");
    ws.onopen = () => setStreamStatus("live");
    ws.onmessage = (ev) => { try { const msg = JSON.parse(String(ev.data)); if (msg?.type === "frame" && typeof msg.data === "string") { setLiveFrame(`data:image/png;base64,${msg.data}`); setStreamStatus("live"); } } catch {} };
    ws.onerror = () => setStreamStatus("offline");
    ws.onclose = () => setStreamStatus((s) => s === "live" ? "offline" : s);
    return () => { ws.close(); };
  }, [currentSession?.id, token]);

  const previewSrc = liveFrame ?? (currentSession ? `/v1/browser/sessions/${currentSession.id}/screenshot.png?t=${previewTick}${token ? `&token=${encodeURIComponent(token)}` : ""}` : null);
  const canControl = currentSession?.control?.owner === "user" && streamStatus === "live";
  const sendInput = (input: Record<string, unknown>) => { if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "input", input })); };
  const onPreviewClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!canControl || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1280;
    const y = ((e.clientY - rect.top) / rect.height) * 720;
    sendInput({ type: "click", x: Math.round(x), y: Math.round(y) });
  };

  if (meQ.isLoading) return <div className="app"><main className="main"><div className="card">Loading...</div></main></div>;
  if (meQ.isError) return (
    <div className="app"><main className="main"><div className="card" style={{ maxWidth: 520 }}>
      <h2 style={{ marginTop: 0 }}>Helm sign in</h2>
      <p className="muted">Create a local session token for web/API/WS access.</p>
      <label className="muted">User ID</label>
      <input value={loginUser} onChange={(e) => setLoginUser(e.target.value)} />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" disabled={login.isPending || !loginUser.trim()} onClick={() => login.mutate()}>Create session</button>
      </div>
      <div className="muted" style={{ marginTop: 10 }}>Dev fallback user (when HELM_ALLOW_DEV_AUTH=1 and HELM_REQUIRE_AUTH=0):</div>
      <input value={devUser} onChange={(e) => { setDevUser(e.target.value); setDevUserState(e.target.value); }} />
      <button style={{ marginTop: 8 }} onClick={() => { setDevUser(devUser); qc.invalidateQueries({ queryKey: ["me"] }); }}>Use dev header</button>
      {authError && <div style={{ color: "var(--danger)", marginTop: 10 }}>{authError}</div>}
      <div className="muted" style={{ marginTop: 10 }}>{String((meQ.error as Error)?.message ?? "")}</div>
    </div></main></div>
  );

  return (
    <div className="app">
      <aside className="side">
        <h2 style={{ marginTop: 0 }}>Helm</h2>
        <p className="muted">Personal AI operator · chat + browser + approvals</p>
        <div className="card" style={{ marginBottom: 16 }}>
          <textarea rows={4} value={prompt} placeholder="Ask Helm or describe an outcome..." onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (prompt.trim() && !send.isPending) send.mutate(prompt.trim()); } }} />
          <div className="row" style={{ marginTop: 8 }}>
            <select value={kind} onChange={(e) => setKind(e.target.value as any)} style={{ background: "#0b1222", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
              <option value="assistant">assistant</option><option value="browser">browser</option>
            </select>
            <button className="primary" disabled={!prompt.trim() || send.isPending} onClick={() => send.mutate(prompt.trim())}>{send.isPending ? "Sending..." : "Send"}</button>
          </div>
        </div>
        <div className="muted" style={{ marginBottom: 8 }}>Tasks</div>
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row"><span className="pill">{meQ.data?.auth.method ?? "?"}</span><span className="muted">{meQ.data?.auth.userId}</span></div>
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={logout}>Sign out</button>
          </div>
        </div>
        <div>{tasks.map((t) => (<div key={t.id} className={`task ${selected === t.id ? "active" : ""}`} onClick={() => setSelected(t.id)}><div style={{ fontSize: 14 }}>{t.title}</div><div className="row"><span className="pill">{t.status}</span><span className="muted">{t.kind}</span></div></div>))}{tasks.length === 0 && <div className="muted">No tasks yet.</div>}</div>
      </aside>
      <main className="main">
        <div className="card">
          <div className="row" style={{ marginBottom: 8 }}><h3 style={{ margin: 0 }}>Chat</h3>{current && <><span className="pill">{current.status}</span><span className="muted">{current.id}</span>{["pause","resume","cancel","retry"].map((a) => <button key={a} onClick={() => control.mutate({ id: current.id, action: a })}>{a}</button>)}</>}</div>
          {!current && <div className="muted">Select a task or send a message to start.</div>}
          {current && <div style={{ display: "grid", gap: 10, maxHeight: 360, overflow: "auto", paddingRight: 4 }}>
            {messages.map((m) => (<div key={m.id} style={{ justifySelf: m.role === "user" ? "end" : "start", maxWidth: "85%", background: m.role === "user" ? "#164e3b" : "#101a31", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}><div className="muted" style={{ marginBottom: 4 }}>{m.role}</div><div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div></div>))}
            {showLiveAssistant && <div style={{ justifySelf: "start", maxWidth: "85%", background: "#101a31", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}><div className="muted" style={{ marginBottom: 4 }}>assistant {current.status}</div><div style={{ whiteSpace: "pre-wrap" }}>{streamingDelta || completedText || "…"}</div></div>}
            {toolCards.length > 0 && <div style={{ display: "grid", gap: 8 }}>{toolCards.map((e) => { const p = e.payload as any; const name = p?.name ?? p?.action ?? e.type; const detail = p?.result ?? p?.reason ?? p?.summary ?? p?.note ?? p?.message ?? ""; return (<div key={e.id} className="card" style={{ padding: 10, background: "#0b1528" }}><div className="row"><span className="pill">{e.type}</span><strong style={{ fontSize: 13 }}>{String(name)}</strong></div>{detail ? <div className="muted" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{String(detail).slice(0, 500)}</div> : null}</div>); })}</div>}
            {!messages.length && !showLiveAssistant && <div className="muted">No messages yet.</div>}
            <div ref={chatEndRef} />
          </div>}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Browser preview</h3>
          {!currentSession && <div className="muted">No browser session yet. Create a browser task to capture live preview.</div>}
          {currentSession && <>
            <div className="row" style={{ marginBottom: 8 }}><span className="pill">{currentSession.status}</span><span className="pill">{currentSession.control?.owner ?? "agent"}</span><span className="pill">{streamStatus}</span><span className="muted">{currentSession.id}</span><span className="muted">{currentSession.title ?? currentSession.currentUrl ?? ""}</span></div>
            <div className="row" style={{ marginBottom: 8 }}>
              <input value={takeoverReason} onChange={(e) => setTakeoverReason(e.target.value)} style={{ flex: 1, background: "#0b1222", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }} />
              <button onClick={() => takeover.mutate({ id: currentSession.id, reason: takeoverReason })} disabled={takeover.isPending}>Request takeover</button>
              <button className="primary" onClick={() => resumeAgent.mutate({ id: currentSession.id })} disabled={resumeAgent.isPending}>Resume agent</button>
            </div>
            {currentSession.control?.takeoverReason && <div className="muted" style={{ marginBottom: 8 }}>Takeover: {currentSession.control.takeoverReason}</div>}
            {previewSrc && <img ref={imgRef} src={previewSrc} alt="Browser preview" onClick={onPreviewClick} style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)", background: "#09101e", cursor: canControl ? "crosshair" : "default" }} />}
            <div className="row" style={{ marginTop: 8 }}>
              <input value={remoteText} onChange={(e) => setRemoteText(e.target.value)} placeholder={canControl ? "Type into browser..." : "Request takeover to control"} disabled={!canControl} style={{ flex: 1, background: "#0b1222", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }} />
              <button disabled={!canControl || !remoteText} onClick={() => { sendInput({ type: "type", text: remoteText }); setRemoteText(""); }}>Send text</button>
              <button disabled={!canControl} onClick={() => sendInput({ type: "press", key: "Enter" })}>Enter</button>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>Live WS screencast; click image or send text during takeover. Falls back to polling screenshot when stream is offline.</div>
          </>}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Evidence & receipts</h3>
          <div className="muted" style={{ marginBottom: 8 }}>Artifacts: {artifacts.length} · Receipts: {receipts.length}</div>
          {artifacts.map((a) => (<div key={a.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}><div className="row"><span className="pill">{a.kind}</span><a href={`/v1/artifacts/${a.id}/download`} target="_blank" rel="noreferrer">{a.id}</a><span className="muted">{a.sizeBytes}B</span></div><div className="muted">sha256: {a.sha256}</div></div>))}
          {receipts.map((r) => (<div key={r.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}><div className="row"><span className="pill">{r.status}</span><strong>{r.actionKind}</strong><span className="muted">{r.id}</span></div><div className="muted">idempotency: {r.idempotencyKey}</div></div>))}
          {artifacts.length === 0 && receipts.length === 0 && <div className="muted">No evidence or receipts yet.</div>}
        </div>
        <div className="card"><h3 style={{ marginTop: 0 }}>Approvals</h3>{pendingApprovals.length === 0 && <div className="muted">No pending approvals for this view.</div>}{pendingApprovals.map((a) => (<div key={a.id} style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}><div className="row"><span className="pill">{a.status}</span><strong>{a.actionKind}</strong><span className="muted">{a.id}</span></div><div className="muted" style={{ margin: "6px 0" }}>{a.summary}</div><div className="muted">actionHash: {a.actionHash}</div><div className="row" style={{ marginTop: 8 }}><button className="primary" disabled={resolveApproval.isPending} onClick={() => resolveApproval.mutate({ id: a.id, decision: "approve" })}>Approve</button><button className="danger" disabled={resolveApproval.isPending} onClick={() => resolveApproval.mutate({ id: a.id, decision: "reject", reason: "Rejected from UI" })}>Reject</button></div><pre style={{ marginTop: 8 }}>{JSON.stringify(a.evidence, null, 2)}</pre></div>))}</div>
        <div className="card"><h3 style={{ marginTop: 0 }}>Event timeline</h3><div className="row" style={{ marginBottom: 8 }}><span className="pill">{stale ? "stale" : "live"}</span><span className="muted">last seq: {lastSequence}</span></div>{events.length === 0 && <div className="muted">No events.</div>}{events.map((e) => (<div key={e.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}><div className="row"><span className="pill">#{e.sequence}</span><strong>{e.type}</strong><span className="muted">{e.source}</span><span className="muted">{new Date(e.ts).toLocaleTimeString()}</span></div><pre>{JSON.stringify(e.payload, null, 2)}</pre></div>))}</div>
      </main>
    </div>
  );
}
