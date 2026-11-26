import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { browserArtifacts, actionReceipts } from "@helm/db";
import { artifactRoutes, receiptRoutes } from "./evidence.js";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

function thenable(value: any) { const p: any = Promise.resolve(value); p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; p.orderBy = () => thenable(value); p.where = () => thenable(value); p.returning = async () => Array.isArray(value) ? value : [value]; return p; }

function makeDb(opts?: { artifacts?: any[]; receipts?: any[] }) {
  const artifacts = opts?.artifacts ?? [];
  const receipts = opts?.receipts ?? [];
  return {
    select: () => ({ from: (table: unknown) => ({ where: () => thenable(table === browserArtifacts ? artifacts : table === actionReceipts ? receipts : []), orderBy: () => ({ limit: async (n: number) => (table === browserArtifacts ? artifacts : receipts).slice(0, n) }) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
  } as any;
}

function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); });
  app.route("/v1/artifacts", artifactRoutes(db));
  app.route("/v1/receipts", receiptRoutes(db));
  return app;
}

describe("evidence routes P8 hardening", () => {
  it("artifact listing omits filesystem path", async () => {
    const db = makeDb({ artifacts: [{ id: "art_1", userId: "u1", taskId: "tsk_1", runId: "run_1", sessionId: "sess_1", kind: "screenshot", path: "C:\\Users\\Tapas\\secret\\shot.png", mime: "image/png", sha256: "abc", sizeBytes: 10, metadata: { safe: true }, createdAt: new Date("2026-01-01T00:00:00Z") }] });
    const res = await makeApp(db).request("/v1/artifacts?taskId=tsk_1");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.artifacts).toHaveLength(1);
    expect(body.artifacts[0]).not.toHaveProperty("path");
    expect(body.artifacts[0]).toMatchObject({ id: "art_1", kind: "screenshot", mime: "image/png", sha256: "abc" });
    expect(JSON.stringify(body)).not.toContain("C:\\\\Users\\\\Tapas\\\\secret\\\\shot.png");
    expect(JSON.stringify(body)).not.toContain("secret\\\\shot.png");
  });

  it("artifact download rejects path outside allowed roots", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "helm-artifacts-"));
    const outside = mkdtempSync(path.join(tmpdir(), "helm-outside-"));
    const outsideFile = path.join(outside, "secret.txt");
    writeFileSync(outsideFile, "secret", "utf8");
    process.env.BROWSER_ARTIFACT_DIR = root;
    const db = makeDb({ artifacts: [{ id: "art_1", userId: "u1", taskId: "tsk_1", runId: "run_1", sessionId: "sess_1", kind: "screenshot", path: outsideFile, mime: "text/plain", sha256: "abc", sizeBytes: 6, metadata: {}, createdAt: new Date("2026-01-01T00:00:00Z") }] });
    const res = await makeApp(db).request("/v1/artifacts/art_1/download");
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body?.error?.code).toBe("FORBIDDEN");
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("artifact download allows file inside allowed root", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "helm-artifacts-"));
    mkdirSync(root, { recursive: true });
    const file = path.join(root, "ok.txt");
    writeFileSync(file, "ok", "utf8");
    process.env.BROWSER_ARTIFACT_DIR = root;
    const db = makeDb({ artifacts: [{ id: "art_1", userId: "u1", taskId: "tsk_1", runId: "run_1", sessionId: "sess_1", kind: "text", path: file, mime: "text/plain", sha256: "abc", sizeBytes: 2, metadata: {}, createdAt: new Date("2026-01-01T00:00:00Z") }] });
    const res = await makeApp(db).request("/v1/artifacts/art_1/download");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    rmSync(root, { recursive: true, force: true });
  });

  it("receipt listing redacts sensitive evidence fields", async () => {
    const db = makeDb({ receipts: [{ id: "rcpt_1", userId: "u1", taskId: "tsk_1", runId: "run_1", approvalId: "apr_1", actionKind: "gmail.send", actionHash: "h", idempotencyKey: "k", status: "executed", externalRef: "x", evidence: { apiKey: "sk-live-123", nested: { accessToken: "tok-abc" }, path: "C:\\Users\\Tapas\\secret.txt", safe: "keep" }, createdAt: new Date("2026-01-01T00:00:00Z") }] });
    const res = await makeApp(db).request("/v1/receipts?taskId=tsk_1");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.receipts[0].evidence.apiKey).toBe("[REDACTED]");
    expect(body.receipts[0].evidence.nested.accessToken).toBe("[REDACTED]");
    expect(body.receipts[0].evidence.path).toBe("[REDACTED_PATH]");
    expect(body.receipts[0].evidence.safe).toBe("keep");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("sk-live-123");
    expect(serialized).not.toContain("tok-abc");
    expect(serialized).not.toContain("C:\\\\Users\\\\Tapas\\\\secret.txt");
  });
});

