import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PlaywrightBrowserExecutor } from "./playwrightExecutor.js";

async function makeExecutor(owner: "user" | "agent" = "user") {
  const dir = await mkdtemp(path.join(tmpdir(), "helm-bw-sendinput-"));
  const ex = new PlaywrightBrowserExecutor({ artifactDir: path.join(dir, "artifacts"), stateDir: path.join(dir, "state") }) as any;
  const calls: any[] = [];
  const keyboard = {
    down: vi.fn(async (k: string) => { calls.push(["down", k]); }),
    up: vi.fn(async (k: string) => { calls.push(["up", k]); }),
    type: vi.fn(async (t: string, o: any) => { calls.push(["type", t, o]); }),
    press: vi.fn(async (k: string, o: any) => { calls.push(["press", k, o]); }),
  };
  const mouse = {
    click: vi.fn(async (_x: number, _y: number, _o: any) => { calls.push(["click"]); throw new Error("boom"); }),
    dblclick: vi.fn(async (x: number, y: number, o: any) => { calls.push(["dblclick", x, y, o]); }),
    move: vi.fn(async (x: number, y: number, o?: any) => { calls.push(["move", x, y, o]); }),
    down: vi.fn(async (o: any) => { calls.push(["mousedown", o]); }),
    up: vi.fn(async (o: any) => { calls.push(["mouseup", o]); }),
    wheel: vi.fn(async (dx: number, dy: number) => { calls.push(["wheel", dx, dy]); }),
  };
  const state = {
    session: { id: "s1", status: "ready", control: { owner, takeoverReason: owner === "user" ? "manual" : null }, updatedAt: new Date().toISOString() },
    page: { keyboard, mouse, isClosed: () => false },
    browser: { isConnected: () => true },
    context: { storageState: vi.fn(async () => {}) },
    cdp: null,
    emitter: { on() {}, off() {}, setMaxListeners() {} },
    storageStatePath: path.join(dir, "state", "s1.storage.json"),
  };
  ex.sessions.set("s1", state);
  ex.scheduleClose = vi.fn();
  return { ex, calls, dir };
}

describe("PlaywrightBrowserExecutor.sendInput error handling", () => {
  const dirs: string[] = [];
  afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

  it("releases modifiers when action throws", async () => {
    const { ex, calls, dir } = await makeExecutor("user"); dirs.push(dir);
    const res = await ex.sendInput("s1", { type: "click", x: 1, y: 2, modifiers: ["Shift", "Alt"] });
    expect(res.ok).toBe(false);
    expect(String(res.error)).toContain("boom");
    expect(calls[0]).toEqual(["down", "Shift"]);
    expect(calls[1]).toEqual(["down", "Alt"]);
    expect(calls.at(-2)).toEqual(["up", "Alt"]);
    expect(calls.at(-1)).toEqual(["up", "Shift"]);
  });
});
