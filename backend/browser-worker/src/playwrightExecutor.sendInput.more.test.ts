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
  return { ex, calls, dir };
}

describe("PlaywrightBrowserExecutor.sendInput more controls", () => {
  const dirs: string[] = [];
  afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

  it("handles move/mousedown/mouseup/dblclick", async () => {
    const { ex, calls, dir } = await makeExecutor("user"); dirs.push(dir);
    expect(await ex.sendInput("s1", { type: "move", x: 1, y: 2 })).toMatchObject({ ok: true, type: "move" });
    expect(await ex.sendInput("s1", { type: "mousedown", x: 3, y: 4, button: "left" })).toMatchObject({ ok: true, type: "mousedown" });
    expect(await ex.sendInput("s1", { type: "mouseup", x: 5, y: 6, button: "left" })).toMatchObject({ ok: true, type: "mouseup" });
    expect(await ex.sendInput("s1", { type: "dblclick", x: 7, y: 8 })).toMatchObject({ ok: true, type: "dblclick" });
    expect(calls).toContainEqual(["move", 1, 2, undefined]);
    expect(calls).toContainEqual(["mousedown", { button: "left" }]);
    expect(calls).toContainEqual(["mouseup", { button: "left" }]);
    expect(calls).toContainEqual(["dblclick", 7, 8, { button: "left" }]);
  });

  it("handles keydown/keyup/type with delay", async () => {
    const { ex, calls, dir } = await makeExecutor("user"); dirs.push(dir);
    expect(await ex.sendInput("s1", { type: "keydown", key: "Shift" })).toMatchObject({ ok: true, type: "keydown" });
    expect(await ex.sendInput("s1", { type: "keyup", key: "Shift" })).toMatchObject({ ok: true, type: "keyup" });
    expect(await ex.sendInput("s1", { type: "type", text: "hi", delay: 5 })).toMatchObject({ ok: true, type: "type" });
    expect(calls).toContainEqual(["down", "Shift"]);
    expect(calls).toContainEqual(["up", "Shift"]);
    expect(calls).toContainEqual(["type", "hi", { delay: 5 }]);
  });
});
