import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { memoryRoutes } from "../routes/memory.js";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

function makeApp(opts?: { selectRows?: any[]; insertRow?: any; updateRow?: any; deleteRow?: any }) {
  const selectRows = opts?.selectRows ?? [];
  const insertRow = opts?.insertRow ?? { id: "mem_1", metadata: {} };
  const updateRow = opts?.updateRow ?? { id: "mem_1", metadata: {} };
  const deleteRow = opts?.deleteRow ?? { id: "mem_1" };
  const db = {
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => selectRows }), limit: async () => selectRows }) }) }),
    insert: () => ({ values: (v: any) => ({ returning: async () => [{ ...insertRow, ...v, metadata: v.metadata ?? insertRow.metadata }] }) }),
    update: () => ({ set: (v: any) => ({ where: () => ({ returning: async () => [{ ...updateRow, ...v, metadata: v.metadata ?? updateRow.metadata }] }) }) }),
    delete: () => ({ where: () => ({ returning: async () => [deleteRow] }) }),
  } as any;
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); });
  app.route("/v1/memory", memoryRoutes(db));
  return app;
}

describe("memory routes (P7b)", () => {
  it("rejects when disabled", async () => {
    process.env.HELM_MEMORY_ENABLED = "0";
    const res = await makeApp().request("/v1/memory/notes");
    expect(res.status).toBe(403);
  });

  it("creates user_confirmed note with redaction and metadata", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    const app = makeApp();
    const res = await app.request("/v1/memory/notes", { method: "POST", body: JSON.stringify({ content: "my api_key is secret" }), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.note.content).toBe("[REDACTED_SENSITIVE_MEMORY]");
    expect(body.note.metadata.redactedSensitive).toBe(true);
    expect(body.note.metadata.provenance.kind).toBe("user_confirmed");
    expect(body.note.metadata.version).toBe(1);
  });

  it("blocks inferred note unless confirmed/allowed", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    delete process.env.HELM_MEMORY_ALLOW_INFERRED;
    const res = await makeApp().request("/v1/memory/notes", { method: "POST", body: JSON.stringify({ content: "guess", provenance: "inferred" }), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(403);
  });

  it("allows inferred note when confirmed", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    const res = await makeApp().request("/v1/memory/notes", { method: "POST", body: JSON.stringify({ content: "guess", provenance: "inferred", confirmed: true, confidence: 0.9 }), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.note.metadata.provenance.kind).toBe("inferred");
    expect(body.note.metadata.confirmed).toBe(true);
    expect(body.note.metadata.confidence).toBeLessThanOrEqual(0.8);
  });

  it("exports and gets by id", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    const row = { id: "mem_1", userId: "u1", content: "hi", metadata: { provenance: { kind: "user_confirmed" }, version: 1 } };
    const app = makeApp({ selectRows: [row] });
    const get = await app.request("/v1/memory/notes/mem_1");
    expect(get.status).toBe(200);
    const exp = await app.request("/v1/memory/export");
    expect(exp.status).toBe(200);
    const body = await exp.json() as any;
    expect(body.count).toBe(1);
  });
});
