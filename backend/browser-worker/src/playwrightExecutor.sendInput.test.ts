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
    click: vi.fn(async (x: number, y: number, o: any) => { calls.push(["click", x, y, o]); }),
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
  return { ex, calls, keyboard, mouse, state, dir };
}

describe("PlaywrightBrowserExecutor.sendInput", () => {
  const dirs: string[] = [];
  afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

  it("rejects input when takeover not active", async () => {
    const { ex, dir } = await makeExecutor("agent"); dirs.push(dir);
    const res = await ex.sendInput("s1", { type: "click", x: 1, y: 2 });
    expect(res).toMatchObject({ ok: false, error: "takeover required for interactive control" });
  });

  it("handles scroll/wheel input", async () => {
    const { ex, calls, dir } = await makeExecutor("user"); dirs.push(dir);
    const res = await ex.sendInput("s1", { type: "scroll", deltaX: 0, deltaY: 240 });
    expect(res).toMatchObject({ ok: true, type: "scroll" });
    expect(calls).toContainEqual(["wheel", 0, 240]);
  });

  it("handles drag input", async () => {
    const { ex, calls, dir } = await makeExecutor("user"); dirs.push(dir);
    const res = await ex.sendInput("s1", { type: "drag", fromX: 10, fromY: 20, toX: 30, toY: 40, steps: 5 });
    expect(res).toMatchObject({ ok: true, type: "drag" });
    expect(calls).toContainEqual(["move", 10, 20, undefined]);
    expect(calls).toContainEqual(["mousedown", { button: "left" }]);
    expect(calls.some((c: any[]) => c[0] === "move" && c[1] === 30 && c[2] === 40)).toBe(true);
    expect(calls).toContainEqual(["mouseup", { button: "left" }]);
  });

  it("holds modifiers for non-press actions and releases in finally", async () => {
    const { ex, calls, dir } = await makeExecutor("user"); dirs.push(dir);
    const res = await ex.sendInput("s1", { type: "click", x: 5, y: 6, modifiers: ["Shift"] });
    expect(res).toMatchObject({ ok: true, type: "click" });
    expect(calls[0]).toEqual(["down", "Shift"]);
    expect(calls.some((c: any[]) => c[0] === "click" && c[1] === 5 && c[2] === 6)).toBe(true);
    expect(calls.at(-1)).toEqual(["up", "Shift"]);
  });

  it("uses combo for press and still releases modifiers", async () => {
    const { ex, calls, dir } = await makeExecutor("user"); dirs.push(dir);
    const res = await ex.sendInput("s1", { type: "press", key: "KeyA", modifiers: ["Control"] });
    expect(res).toMatchObject({ ok: true, type: "press" });
    expect(calls).toContainEqual(["down", "Control"]);
    expect(calls).toContainEqual(["press", "Control+KeyA", { delay: 0 }]);
    expect(calls.at(-1)).toEqual(["up", "Control"]);
  });

  it("returns unsupported input type", async () => {
    const { ex, dir } = await makeExecutor("user"); dirs.push(dir);
    const res = await ex.sendInput("s1", { type: "nope" });
    expect(res).toMatchObject({ ok: false, error: "unsupported input type", type: "nope" });
  });
});
