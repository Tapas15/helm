import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PlaywrightBrowserExecutor } from "./playwrightExecutor.js";

async function makeExecutor() {
  const dir = await mkdtemp(path.join(tmpdir(), "helm-bw-wsrec-"));
  const ex = new PlaywrightBrowserExecutor({ artifactDir: path.join(dir, "artifacts"), stateDir: path.join(dir, "state") }) as any;
  const goto = vi.fn();
  const state: any = {
    session: { id: "s1", status: "ready", control: { owner: "agent", takeoverReason: null, takeoverRequestedAt: null, resumedAt: null }, updatedAt: new Date().toISOString(), currentUrl: "about:blank", title: null },
    page: { goto, url: () => "https://example.com", title: async () => "Example", isClosed: () => false },
    browser: { isConnected: () => true },
    context: { storageState: vi.fn(async () => {}) },
    cdp: null,
    emitter: { on() {}, off() {}, setMaxListeners() {} },
    storageStatePath: path.join(dir, "state", "s1.storage.json"),
  };
  ex.sessions.set("s1", state);
  ex.scheduleClose = vi.fn();
  ex.persistState = vi.fn(async () => {});
  ex.discardSession = vi.fn(async () => { ex.sessions.delete("s1"); });
  return { ex, dir, state, goto };
}

describe("PlaywrightBrowserExecutor.withSession stale recovery", () => {
  const dirs: string[] = [];
  afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

  it("retries once after stale-target recovery and marks recovered", async () => {
    const { ex, dir, state, goto } = await makeExecutor(); dirs.push(dir);
    let calls = 0;
    goto.mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new Error("Target page, context or browser has been closed");
      return undefined;
    });
    ex.restoreSession = vi.fn(async () => { ex.sessions.set("s1", state); return state; });
    const res = await ex.navigate("s1", { url: "https://example.com" });
    expect(res.ok).toBe(true);
    expect(res.data?.recovered).toBe(true);
    expect(ex.discardSession).toHaveBeenCalledWith("s1");
    expect(ex.restoreSession).toHaveBeenCalledWith("s1");
    expect(goto).toHaveBeenCalledTimes(2);
  });

  it("returns retryable failure when stale-target recovery cannot restore session", async () => {
    const { ex, dir, goto } = await makeExecutor(); dirs.push(dir);
    goto.mockRejectedValue(new Error("browser has been closed"));
    ex.restoreSession = vi.fn(async () => null);
    const res = await ex.navigate("s1", { url: "https://example.com" });
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("BROWSER_ACTION_FAILED");
    expect(res.error?.retryable).toBe(true);
    expect(ex.discardSession).toHaveBeenCalledWith("s1");
    expect(ex.restoreSession).toHaveBeenCalledWith("s1");
  });
});
