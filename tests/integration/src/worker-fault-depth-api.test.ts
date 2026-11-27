import { describe, expect, it } from "vitest";

const base = process.env.HELM_API_URL ?? "http://127.0.0.1:8787";
const run = process.env.HELM_INTEGRATION_API === "1";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", "x-user-id": "usr_local_dev", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

(run ? describe : describe.skip)("Worker lease/fault depth (real-service proof)", () => {
  it("reclaims expired lease after partial progress and does not duplicate terminal events across forced reclaim cycles", async () => {
    const prompt = `lease fault depth ${Date.now()}`;
    const create = await api("/v1/tasks", { method: "POST", body: JSON.stringify({ prompt, kind: "assistant" }) });
    expect(create.status).toBe(201);
    const taskId = create.json?.task?.id as string;
    expect(taskId).toBeTruthy();

    const terminal = async () => {
      const got = await api(`/v1/tasks/${taskId}`);
      const status = String(got.json?.task?.status ?? "");
      return ["succeeded", "failed", "cancelled"].includes(status) ? got.json?.task : null;
    };

    // Force a stale lease while queued (simulates worker crash after claim boundary).
    const expired1 = await api(`/v1/test/tasks/${taskId}/expire-lease`, { method: "POST", body: JSON.stringify({ leaseUntil: new Date(Date.now() - 120_000).toISOString() }) });
    expect(expired1.status).toBe(200);
    expect(expired1.json?.task?.status).toBe("queued");

    // Wait for worker to reclaim and start running, unless it already completed quickly.
    let sawRunning = false;
    for (let i = 0; i < 60; i++) {
      if (await terminal()) break;
      const got = await api(`/v1/tasks/${taskId}`);
      if (String(got.json?.task?.status) === "running") { sawRunning = true; break; }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // If still non-terminal, force-expire again to simulate another crash/reclaim cycle.
    if (!(await terminal())) {
      expect(sawRunning).toBe(true);
      const expired2 = await api(`/v1/test/tasks/${taskId}/expire-lease`, { method: "POST", body: JSON.stringify({ leaseUntil: new Date(Date.now() - 120_000).toISOString() }) });
      expect(expired2.status).toBe(200);
      expect(["queued", "running", "failed", "cancelled", "succeeded"]).toContain(String(expired2.json?.task?.status));
    }

    let task: any = null;
    for (let i = 0; i < 120; i++) {
      task = await terminal();
      if (task) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(task).toBeTruthy();
    expect(["succeeded", "failed", "cancelled"]).toContain(String(task.status));
    expect(task.leaseOwner ?? null).toBeNull();
    expect(task.leaseUntil ?? null).toBeNull();

    const events = await api(`/v1/tasks/${taskId}/events?after=-1&limit=1000`);
    expect(events.status).toBe(200);
    const types = (events.json?.events ?? []).map((e: any) => String(e.type));
    const terminals = types.filter((t: string) => t === "task.completed" || t === "task.failed");
    expect(terminals.length).toBeLessThanOrEqual(1);
    const seededExpiries = types.filter((t: string) => t === "task.lease.expired.seeded");
    expect(seededExpiries.length).toBeGreaterThanOrEqual(1);
  }, 240000);
});
