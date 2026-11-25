import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { memoryNotes } from "@helm/db";
import { memoryRoutes } from "../routes/memory.js";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

function makeDb(rows: any[]) {
  return {
    select: () => ({ from: (table: unknown) => ({ where: () => ({ orderBy: () => ({ limit: async () => table === memoryNotes ? rows : [] }), limit: async () => table === memoryNotes ? rows : [] }) }) }),
    insert: () => ({ values: () => ({ returning: async () => [] }) }),
  } as any;
}

function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); });
  app.route("/v1/memory", memoryRoutes(db));
  return app;
}

describe("memory retrieval modes (P7b)", () => {
  it("uses lexical mode by default", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    process.env.HELM_MEMORY_RETRIEVAL_ENABLED = "1";
    delete process.env.HELM_MEMORY_SEMANTIC_RETRIEVAL;
    const db = makeDb([{ id: "m1", userId: "u1", kind: "note", content: "likes dark mode", metadata: { provenance: { kind: "user_confirmed" }, confidence: 1 }, createdAt: new Date() }]);
    const res = await makeApp(db).request("/v1/memory/retrieval?q=dark");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.mode).toBe("lexical");
  });

  it("uses deterministic semantic-hash-fallback when flag enabled", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    process.env.HELM_MEMORY_RETRIEVAL_ENABLED = "1";
    process.env.HELM_MEMORY_SEMANTIC_RETRIEVAL = "1";
    const db = makeDb([{ id: "m1", userId: "u1", kind: "note", content: "prefers dim editor theme", metadata: { provenance: { kind: "observed" }, confidence: 0.8 }, createdAt: new Date() }]);
    const res = await makeApp(db).request("/v1/memory/retrieval?q=dark%20theme");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.mode).toBe("semantic-hash-fallback");
    expect(Array.isArray(body.matches)).toBe(true);
  });
});
