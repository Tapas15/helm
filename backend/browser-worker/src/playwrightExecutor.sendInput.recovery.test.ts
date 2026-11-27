import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PlaywrightBrowserExecutor } from "./playwrightExecutor.js";

async function makeExecutor() {
  const dir = await mkdtemp(path.join(tmpdir(), "helm-bw-sendinput-rec-"));
  const ex = new PlaywrightBrowserExecutor({ artifactDir: path.join(dir, "artifacts"), stateDir: path.join(dir, "state") }) as any;
  const calls: any[] = [];
  const state = {
    session: { id: "s1", status: "ready", control: { owner: "user", takeoverReason: "manual" }, updatedAt: new Date().toISOString() },
    page: {
      keyboard: { down: vi.fn(), up: vi.fn(), type: vi.fn(), press: vi.fn() },
      mouse: { click: vi.fn(async () => { calls.push("click"); throw new Error("Target page, context or browser has been closed"); }), wheel: vi.fn(), move: vi.fn(), down: vi.fn(), up: vi.fn(), dblclick: vi.fn() },
      isClosed: () => false,
    },
    browser: { isConnected: () => true },
    context: { storageState: vi.fn(async () => {}) },
    cdp: null,
    emitter: { on() {}, off() {}, setMaxListeners() {} },
    storageStatePath: path.join(dir, "state", "s1.storage.json"),
  };
  ex.sessions.set("s1", state);
  ex.scheduleClose = vi.fn();
  ex.discardSession = vi.fn(async () => { ex.sessions.delete("s1"); });
  ex.restoreSession = vi.fn(async () => ({ ...state, session: { ...state.session } }));
  return { ex, calls, dir };
}

describe("PlaywrightBrowserExecutor.sendInput stale recovery", () => {
  const dirs: string[] = [];
  afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

  it("returns retryable recovery signal when stale-target click recovers session", async () => {
    const { ex, dir } = await makeExecutor(); dirs.push(dir);
    const res = await ex.sendInput("s1", { type: "click", x: 10, y: 20 });
    expect(res.ok).toBe(false);
    expect(String(res.error)).toContain("recovered after stale target");
    expect(ex.discardSession).toHaveBeenCalledWith("s1");
    expect(ex.restoreSession).toHaveBeenCalledWith("s1");
  });
});
