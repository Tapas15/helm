import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { auditLog, memoryNotes } from "@helm/db";
import { memoryRoutes } from "../routes/memory.js";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

function makeDb(opts?: { selectRows?: any[]; insertRow?: any; updateRow?: any; deleteRow?: any }) {
  const selectRows = opts?.selectRows ?? [];
  const insertRow = opts?.insertRow ?? { id: "mem_1", metadata: {} };
  const updateRow = opts?.updateRow ?? { id: "mem_1", metadata: {} };
  const deleteRow = opts?.deleteRow ?? { id: "mem_1" };
  const auditRows: any[] = [];
  const db = {
    auditRows,
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          orderBy: () => ({ limit: async () => (table === auditLog ? selectRows : table === memoryNotes ? selectRows : []) }),
          limit: async () => (table === auditLog ? selectRows : table === memoryNotes ? selectRows : []),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (v: any) => {
        const row = { ...insertRow, ...v, metadata: v.metadata ?? insertRow.metadata };
        if (table === auditLog) auditRows.push(v);
        return {
          returning: async () => [table === auditLog ? v : row],
        };
      },
    }),
    update: () => ({ set: (v: any) => ({ where: () => ({ returning: async () => [{ ...updateRow, ...v, metadata: v.metadata ?? updateRow.metadata }] }) }) }),
    delete: () => ({ where: () => ({ returning: async () => [deleteRow] }) }),
  } as any;
  return db;
}

function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); });
  app.route("/v1/memory", memoryRoutes(db));
  return app;
}

describe("memory routes (P7b)", () => {
  it("status reports memory/retrieval/embedding flags with safe defaults", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    process.env.HELM_MEMORY_RETRIEVAL_ENABLED = "1";
    process.env.HELM_MEMORY_SEMANTIC_RETRIEVAL = "1";
    process.env.HELM_MEMORY_EMBEDDING_PROVIDER = "unknown-external";
    process.env.HELM_MEMORY_CONSOLIDATION_DRY_RUN = "0";
    process.env.HELM_MEMORY_RETENTION_DRY_RUN = "1";
    const db = makeDb({ selectRows: [{ id: "mem_1" }] });
    const res = await makeApp(db).request("/v1/memory/status");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.enabled).toBe(true);
    expect(body.retrievalEnabled).toBe(true);
    expect(body.semanticRetrievalEnabled).toBe(true);
    expect(body.embeddingProviderSelection).toBe("unknown-external");
    expect(body.embeddingProviderInjected).toBe(false);
    expect(body.consolidationDryRunEnabled).toBe(false);
    expect(body.retentionDryRunEnabled).toBe(true);
  });

  it("status reports disabled safely without exposing note rows", async () => {
    process.env.HELM_MEMORY_ENABLED = "0";
    process.env.HELM_MEMORY_RETRIEVAL_ENABLED = "1";
    process.env.HELM_MEMORY_SEMANTIC_RETRIEVAL = "1";
    process.env.HELM_MEMORY_EMBEDDING_PROVIDER = "external-unknown";
    process.env.HELM_MEMORY_CONSOLIDATION_DRY_RUN = "1";
    process.env.HELM_MEMORY_RETENTION_DRY_RUN = "1";
    let selectCalls = 0;
    const db = makeDb({ selectRows: [{ id: "mem_1" }] });
    const origSelect = db.select;
    db.select = (...args: any[]) => { selectCalls++; return origSelect(...args); };
    const res = await makeApp(db).request("/v1/memory/status");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Object.keys(body).sort()).toEqual([
      "consolidationDryRunEnabled",
      "embeddingProviderInjected",
      "embeddingProviderSelection",
      "enabled",
      "inferredAllowed",
      "mode",
      "notesVisible",
      "ok",
      "retentionDryRunEnabled",
      "retrievalEnabled",
      "semanticRetrievalEnabled",
    ]);
    expect(body.enabled).toBe(false);
    expect(body.mode).toBe("disabled");
    expect(body.notesVisible).toBe(0);
    expect(body.embeddingProviderSelection).toBe("external-unknown");
    expect(body.embeddingProviderInjected).toBe(false);
    expect(body).not.toHaveProperty("notes");
    expect(body).not.toHaveProperty("content");
    expect(selectCalls).toBe(0);
  });

  it("status never exposes embedding provider secrets or config beyond selection/injected", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    process.env.HELM_MEMORY_EMBEDDING_PROVIDER = "disabled";
    process.env.HELM_MEMORY_EMBEDDING_API_KEY = "super-secret-key";
    process.env.OPENAI_API_KEY = "openai-secret";
    const db = makeDb({ selectRows: [] });
    const res = await makeApp(db).request("/v1/memory/status");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.embeddingProviderSelection).toBe("disabled");
    expect(body.embeddingProviderInjected).toBe(false);
    const text = JSON.stringify(body);
    expect(text).not.toContain("super-secret-key");
    expect(text).not.toContain("openai-secret");
    expect(body).not.toHaveProperty("embeddingProviderApiKey");
    expect(body).not.toHaveProperty("apiKey");
  });

  it("rejects when disabled", async () => {
    process.env.HELM_MEMORY_ENABLED = "0";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/memory/notes");
    expect(res.status).toBe(403);
  });

  it("disabled mode blocks memory data endpoints consistently with no row queries", async () => {
    process.env.HELM_MEMORY_ENABLED = "0";
    process.env.HELM_MEMORY_RETRIEVAL_ENABLED = "1";
    process.env.HELM_MEMORY_CONSOLIDATION_DRY_RUN = "1";
    process.env.HELM_MEMORY_RETENTION_DRY_RUN = "1";
    let selectCalls = 0;
    let deleteCalls = 0;
    let updateCalls = 0;
    const db = makeDb({ selectRows: [{ id: "mem_1", content: "secret-note" }] });
    const origSelect = db.select;
    const origDelete = db.delete;
    const origUpdate = db.update;
    db.select = (...args: any[]) => { selectCalls++; return origSelect(...args); };
    db.delete = (...args: any[]) => { deleteCalls++; return origDelete(...args); };
    db.update = (...args: any[]) => { updateCalls++; return origUpdate(...args); };
    const app = makeApp(db);

    const endpoints: Array<{ method: "GET" | "POST"; path: string; body?: unknown }> = [
      { method: "GET", path: "/v1/memory/notes" },
      { method: "GET", path: "/v1/memory/export" },
      { method: "GET", path: "/v1/memory/notes/mem_1" },
      { method: "GET", path: "/v1/memory/retrieval?q=dark" },
      { method: "GET", path: "/v1/memory/consolidation/dry-run" },
      { method: "GET", path: "/v1/memory/retention/dry-run" },
      { method: "POST", path: "/v1/memory/notes", body: { content: "x" } },
    ];
    for (const ep of endpoints) {
      const res = await app.request(ep.path, ep.method === "POST" ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ep.body ?? {}) } : undefined);
      expect(res.status).toBe(403);
      const body = await res.json() as any;
      expect(body.error?.message).toMatch(/Memory is disabled/i);
      expect(JSON.stringify(body)).not.toContain("secret-note");
    }

    const status = await app.request("/v1/memory/status");
    expect(status.status).toBe(200);
    const statusBody = await status.json() as any;
    expect(statusBody.enabled).toBe(false);
    expect(JSON.stringify(statusBody)).not.toContain("secret-note");
    expect(selectCalls).toBe(0);
    expect(deleteCalls).toBe(0);
    expect(updateCalls).toBe(0);
  });

  it("creates user_confirmed note with redaction and metadata and audits create", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/memory/notes", { method: "POST", body: JSON.stringify({ content: "my api_key is secret" }), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.note.content).toBe("[REDACTED_SENSITIVE_MEMORY]");
    expect(body.note.metadata.redactedSensitive).toBe(true);
    expect(body.note.metadata.provenance.kind).toBe("user_confirmed");
    expect(body.note.metadata.version).toBe(1);
    expect(db.auditRows.some((r: any) => r.action === "memory.create" && r.resourceType === "memory_note")).toBe(true);
  });

  it("blocks inferred note unless confirmed/allowed", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    delete process.env.HELM_MEMORY_ALLOW_INFERRED;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/memory/notes", { method: "POST", body: JSON.stringify({ content: "guess", provenance: "inferred" }), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(403);
  });

  it("allows inferred note when confirmed", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/memory/notes", { method: "POST", body: JSON.stringify({ content: "guess", provenance: "inferred", confirmed: true, confidence: 0.9 }), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.note.metadata.provenance.kind).toBe("inferred");
    expect(body.note.metadata.confirmed).toBe(true);
    expect(body.note.metadata.confidence).toBeLessThanOrEqual(0.8);
  });

  it("exports and gets by id and audits export", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    const row = { id: "mem_1", userId: "u1", content: "hi", metadata: { provenance: { kind: "user_confirmed" }, version: 1 } };
    const db = makeDb({ selectRows: [row] });
    const app = makeApp(db);
    const get = await app.request("/v1/memory/notes/mem_1");
    expect(get.status).toBe(200);
    const exp = await app.request("/v1/memory/export");
    expect(exp.status).toBe(200);
    const body = await exp.json() as any;
    expect(body.count).toBe(1);
    expect(db.auditRows.some((r: any) => r.action === "memory.export" && r.metadata?.count === 1)).toBe(true);
  });

  it("audits delete", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    const db = makeDb({ deleteRow: { id: "mem_1" } });
    const res = await makeApp(db).request("/v1/memory/notes/mem_1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(db.auditRows.some((r: any) => r.action === "memory.delete" && r.resourceId === "mem_1")).toBe(true);
  });

  it("audits update with provenance/version metadata", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    const existing = { id: "mem_1", userId: "u1", content: "old", kind: "note", metadata: { provenance: { kind: "user_confirmed" }, version: 1, confidence: 1, confirmed: true } };
    const db = makeDb({ selectRows: [existing], updateRow: { ...existing, content: "new", metadata: { provenance: { kind: "user_confirmed" }, version: 2, confidence: 1, confirmed: true } } });
    const res = await makeApp(db).request("/v1/memory/notes/mem_1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "new" }) });
    expect(res.status).toBe(200);
    const row = db.auditRows.find((r: any) => r.action === "memory.update" && r.resourceId === "mem_1");
    expect(row).toBeTruthy();
    expect(row.metadata?.provenance).toBe("user_confirmed");
  });

  it("stores retention/PII metadata without auto-delete", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/memory/notes", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "remember this", retentionPolicy: "ephemeral", expiresAt: "2026-12-31T00:00:00.000Z", pii: "possible" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.note.metadata.retentionPolicy).toBe("ephemeral");
    expect(body.note.metadata.expiresAt).toBe("2026-12-31T00:00:00.000Z");
    expect(body.note.metadata.pii).toBe("possible");
  });

  it("returns bounded lexical retrieval matches when flag enabled", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    process.env.HELM_MEMORY_RETRIEVAL_ENABLED = "1";
    const rows = [
      { id: "mem_1", userId: "u1", kind: "preference", content: "User prefers dark mode in editor", metadata: { provenance: { kind: "user_confirmed" }, confidence: 1, version: 1 }, createdAt: new Date("2026-01-02T00:00:00Z") },
      { id: "mem_2", userId: "u1", kind: "note", content: "Uses vim keybindings", metadata: { provenance: { kind: "observed" }, confidence: 0.8, version: 1 }, createdAt: new Date("2026-01-01T00:00:00Z") },
    ];
    const db = makeDb({ selectRows: rows });
    const res = await makeApp(db).request("/v1/memory/retrieval?q=dark%20mode");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.matches.length).toBeGreaterThan(0);
    expect(body.matches[0].note.id).toBe("mem_1");
    expect(body.note).toMatch(/no auto-delete/i);
    expect(db.auditRows.some((r: any) => r.action === "memory.retrieval.query")).toBe(true);
  });

  it("retrieval is forbidden when retrieval flag disabled", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    process.env.HELM_MEMORY_RETRIEVAL_ENABLED = "0";
    const db = makeDb({ selectRows: [] });
    const res = await makeApp(db).request("/v1/memory/retrieval?q=dark");
    expect(res.status).toBe(403);
  });

  it("retrieval audit records bounded metadata without raw query content", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    process.env.HELM_MEMORY_RETRIEVAL_ENABLED = "1";
    const rows = [
      { id: "mem_1", userId: "u1", kind: "note", content: "prefers dark mode", metadata: { provenance: { kind: "user_confirmed" }, confidence: 1 }, createdAt: new Date("2026-01-02T00:00:00Z") },
    ];
    const db = makeDb({ selectRows: rows });
    const q = "dark mode";
    const res = await makeApp(db).request(`/v1/memory/retrieval?q=${encodeURIComponent(q)}`);
    expect(res.status).toBe(200);
    const audit = db.auditRows.find((r: any) => r.action === "memory.retrieval.query");
    expect(audit).toBeTruthy();
    expect(audit.metadata?.qLength).toBe(q.length);
    expect(audit.metadata?.scanned).toBe(1);
    expect(audit.metadata?.matches).toBe(1);
    expect(typeof audit.metadata?.mode).toBe("string");
    expect(audit.metadata).not.toHaveProperty("query");
    expect(audit.metadata).not.toHaveProperty("q");
    expect(JSON.stringify(audit.metadata)).not.toContain(q);
  });

  it("consolidation dry-run reports duplicate candidates and makes no changes", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    process.env.HELM_MEMORY_CONSOLIDATION_DRY_RUN = "1";
    const rows = [
      { id: "mem_1", userId: "u1", kind: "note", content: "Same fact", metadata: { version: 1 }, createdAt: new Date("2026-01-03T00:00:00Z") },
      { id: "mem_2", userId: "u1", kind: "note", content: "Same fact", metadata: { version: 1 }, createdAt: new Date("2026-01-02T00:00:00Z") },
      { id: "mem_3", userId: "u1", kind: "note", content: "Different", metadata: { version: 1 }, createdAt: new Date("2026-01-01T00:00:00Z") },
    ];
    let deleteCalls = 0;
    let updateCalls = 0;
    const db = makeDb({ selectRows: rows });
    const origDelete = db.delete;
    const origUpdate = db.update;
    db.delete = (...args: any[]) => { deleteCalls++; return origDelete(...args); };
    db.update = (...args: any[]) => { updateCalls++; return origUpdate(...args); };
    const res = await makeApp(db).request("/v1/memory/consolidation/dry-run");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.dryRun).toBe(true);
    expect(body.deleted).toBe(0);
    expect(body.modified).toBe(0);
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].duplicateIds).toContain("mem_2");
    expect(body.candidates[0].proposalOnly).toBe(true);
    expect(body.candidates[0].recommendedAction).toBe("review_only_no_auto_merge");
    expect(body.candidates[0].suggestedCanonical?.id).toBe("mem_1");
    expect(body.candidates[0].mergePreview?.applied).toBe(false);
    expect(body.candidates[0].mergePreview?.canonicalId).toBe("mem_1");
    expect(body.candidates[0].mergePreview?.duplicateIds).toEqual(["mem_2"]);
    expect(body.candidates[0].mergePreview?.wouldMergeCount).toBe(1);
    expect(body.candidates[0].mergePreview?.strategy).toBe("exact_dedupe_keep_newest");
    expect(deleteCalls).toBe(0);
    expect(updateCalls).toBe(0);
    expect(db.auditRows.some((r: any) => r.action === "memory.consolidation.dry_run" && r.metadata?.dryRun === true)).toBe(true);
  });

  it("consolidation dry-run is forbidden when flag disabled", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    process.env.HELM_MEMORY_CONSOLIDATION_DRY_RUN = "0";
    const db = makeDb({ selectRows: [] });
    const res = await makeApp(db).request("/v1/memory/consolidation/dry-run");
    expect(res.status).toBe(403);
  });

  it("retention dry-run reports candidates and does not delete", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    process.env.HELM_MEMORY_RETENTION_DRY_RUN = "1";
    const expired = { id: "mem_exp", userId: "u1", kind: "note", content: "old", metadata: { retentionPolicy: "ephemeral", expiresAt: "2020-01-01T00:00:00.000Z", pii: "none", version: 1 } };
    const keep = { id: "mem_keep", userId: "u1", kind: "note", content: "keep", metadata: { retentionPolicy: "user_controlled", expiresAt: null, pii: "none", version: 1 } };
    let deleteCalls = 0;
    const db = makeDb({ selectRows: [expired, keep] });
    const origDelete = db.delete;
    db.delete = (...args: any[]) => { deleteCalls++; return origDelete(...args); };
    const res = await makeApp(db).request("/v1/memory/retention/dry-run");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.dryRun).toBe(true);
    expect(body.deleted).toBe(0);
    expect(body.candidates.some((c: any) => c.id === "mem_exp")).toBe(true);
    expect(body.candidates.some((c: any) => c.id === "mem_keep")).toBe(false);
    expect(deleteCalls).toBe(0);
    expect(db.auditRows.some((r: any) => r.action === "memory.retention.dry_run" && r.metadata?.dryRun === true)).toBe(true);
  });

  it("retention dry-run is forbidden when flag disabled", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    process.env.HELM_MEMORY_RETENTION_DRY_RUN = "0";
    const db = makeDb({ selectRows: [] });
    const res = await makeApp(db).request("/v1/memory/retention/dry-run");
    expect(res.status).toBe(403);
  });

  it("filters notes by bounded q search", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    const rows = [
      { id: "mem_1", userId: "u1", kind: "preference", content: "likes dark mode", metadata: { provenance: { kind: "user_confirmed" } }, createdAt: new Date("2026-01-02T00:00:00Z") },
      { id: "mem_2", userId: "u1", kind: "note", content: "uses vim", metadata: { provenance: { kind: "observed" } }, createdAt: new Date("2026-01-01T00:00:00Z") },
    ];
    const db = makeDb({ selectRows: rows });
    const res = await makeApp(db).request("/v1/memory/notes?q=dark");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0].id).toBe("mem_1");
  });

  it("redacts PII-like email/card content in memory notes", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    const db = makeDb({ selectRows: [] });
    const res = await makeApp(db).request("/v1/memory/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "contact me at test@example.com card 4111111111111111", kind: "note", confirmed: true }) });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.note.content).toBe("[REDACTED_SENSITIVE_MEMORY]");
    expect(body.note.metadata?.pii).toBe("redacted");
    expect(body.note.metadata?.redactedSensitive).toBe(true);
  });

  it("redacts PII-like phone/address content in memory notes", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    const db = makeDb({ selectRows: [] });
    const res = await makeApp(db).request("/v1/memory/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "Call me at (415) 555-1212, 12 Main Street", kind: "note", confirmed: true }) });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.note.content).toBe("[REDACTED_SENSITIVE_MEMORY]");
    expect(body.note.metadata?.pii).toBe("redacted");
  });

  it("returns bounded recent memory audit events for user", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    const db = makeDb({ selectRows: [{ id: "aud_1", ts: new Date("2026-01-01T00:00:00Z"), action: "memory.create", resourceId: "mem_1", decision: "allow", reason: null, metadata: { kind: "note" } }] });
    const res = await makeApp(db).request("/v1/memory/audit/recent");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events[0]).toEqual({
      id: "aud_1",
      ts: new Date("2026-01-01T00:00:00Z").toISOString(),
      action: "memory.create",
      resourceId: "mem_1",
      decision: "allow",
      reason: null,
      metadata: { kind: "note" },
    });
  });

  it("audit recent is forbidden when memory disabled", async () => {
    process.env.HELM_MEMORY_ENABLED = "0";
    let selectCalls = 0;
    const db = makeDb({ selectRows: [{ id: "aud_1" }] });
    const origSelect = db.select;
    db.select = (...args: any[]) => { selectCalls++; return origSelect(...args); };
    const res = await makeApp(db).request("/v1/memory/audit/recent");
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error?.message).toMatch(/Memory is disabled/i);
    expect(selectCalls).toBe(0);
  });

  it("has no consolidation apply endpoint and dry-run remains non-mutating contract", async () => {
    process.env.HELM_MEMORY_ENABLED = "1";
    process.env.HELM_MEMORY_CONSOLIDATION_DRY_RUN = "1";
    const rows = [
      { id: "mem_1", userId: "u1", kind: "note", content: "Same fact", metadata: { version: 1 }, createdAt: new Date("2026-01-03T00:00:00Z") },
      { id: "mem_2", userId: "u1", kind: "note", content: "Same fact", metadata: { version: 1 }, createdAt: new Date("2026-01-02T00:00:00Z") },
    ];
    let deleteCalls = 0;
    let updateCalls = 0;
    const db = makeDb({ selectRows: rows });
    const origDelete = db.delete;
    const origUpdate = db.update;
    db.delete = (...args: any[]) => { deleteCalls++; return origDelete(...args); };
    db.update = (...args: any[]) => { updateCalls++; return origUpdate(...args); };
    const app = makeApp(db);

    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const res = await app.request("/v1/memory/consolidation/apply", { method });
      expect([404, 405]).toContain(res.status);
    }

    const dryRun = await app.request("/v1/memory/consolidation/dry-run");
    expect(dryRun.status).toBe(200);
    const body = await dryRun.json() as any;
    expect(body.dryRun).toBe(true);
    expect(body.deleted).toBe(0);
    expect(body.modified).toBe(0);
    expect(body.candidates[0]?.mergePreview?.applied).toBe(false);
    expect(deleteCalls).toBe(0);
    expect(updateCalls).toBe(0);
  });

  it("route inventory enforces enabled gate except status and dry-runs remain non-mutating", async () => {
    process.env.HELM_MEMORY_ENABLED = "0";
    process.env.HELM_MEMORY_RETRIEVAL_ENABLED = "1";
    process.env.HELM_MEMORY_CONSOLIDATION_DRY_RUN = "1";
    process.env.HELM_MEMORY_RETENTION_DRY_RUN = "1";
    let selectCalls = 0;
    let deleteCalls = 0;
    let updateCalls = 0;
    const db = makeDb({ selectRows: [{ id: "mem_1", userId: "u1", kind: "note", content: "Same fact", metadata: { retentionPolicy: "ephemeral", expiresAt: "2020-01-01T00:00:00.000Z" }, createdAt: new Date("2026-01-01T00:00:00Z") }] });
    const origSelect = db.select; const origDelete = db.delete; const origUpdate = db.update;
    db.select = (...args: any[]) => { selectCalls++; return origSelect(...args); };
    db.delete = (...args: any[]) => { deleteCalls++; return origDelete(...args); };
    db.update = (...args: any[]) => { updateCalls++; return origUpdate(...args); };
    const app = makeApp(db);

    const dataRoutes: Array<{ method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; body?: unknown }> = [
      { method: "GET", path: "/v1/memory/notes" },
      { method: "GET", path: "/v1/memory/export" },
      { method: "POST", path: "/v1/memory/notes", body: { content: "x" } },
      { method: "PATCH", path: "/v1/memory/notes/mem_1", body: { content: "y" } },
      { method: "GET", path: "/v1/memory/notes/mem_1" },
      { method: "DELETE", path: "/v1/memory/notes/mem_1" },
      { method: "GET", path: "/v1/memory/retention/dry-run" },
      { method: "GET", path: "/v1/memory/retrieval?q=dark" },
      { method: "GET", path: "/v1/memory/consolidation/dry-run" },
      { method: "GET", path: "/v1/memory/audit/recent" },
    ];
    for (const r of dataRoutes) {
      const res = await app.request(r.path, r.method === "GET" ? undefined : { method: r.method, headers: { "content-type": "application/json" }, body: JSON.stringify(r.body ?? {}) });
      expect(res.status, `disabled gate ${r.method} ${r.path}`).toBe(403);
    }
    expect(selectCalls).toBe(0);
    expect(deleteCalls).toBe(0);
    expect(updateCalls).toBe(0);

    process.env.HELM_MEMORY_ENABLED = "1";
    const dryRunRoutes = ["/v1/memory/consolidation/dry-run", "/v1/memory/retention/dry-run"];
    for (const path of dryRunRoutes) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.dryRun).toBe(true);
      expect(body.deleted).toBe(0);
    }
    expect(deleteCalls).toBe(0);
    expect(updateCalls).toBe(0);
  });
});





