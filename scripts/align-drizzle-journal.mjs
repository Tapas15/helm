import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const container = process.env.HELM_DB_CONTAINER ?? "infra-postgres-1";
const db = process.env.HELM_DB_NAME ?? "helm";
const dbUser = process.env.HELM_DB_USER ?? "postgres";
const journalPath = "packages/db/drizzle/meta/_journal.json";
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const probes = {
  "0000_motionless_smasher": "SELECT to_regclass('public.action_receipts') IS NOT NULL AND to_regclass('public.tasks') IS NOT NULL AS ok",
};
const hash = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const psql = (sql) => execFileSync("docker", ["exec", container, "psql", "-U", dbUser, "-d", db, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

psql("CREATE SCHEMA IF NOT EXISTS drizzle");
psql("CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)");
for (const entry of journal.entries ?? []) {
  const tag = entry.tag;
  const file = `packages/db/drizzle/${tag}.sql`;
  const h = hash(file);
  const createdAt = Number(entry.when);
  const probe = probes[tag] ?? "SELECT false AS ok";
  const present = psql(probe) === "t";
  const existing = psql(`SELECT id FROM drizzle.__drizzle_migrations WHERE hash='${h}' OR created_at=${createdAt} LIMIT 1`);
  if (existing) { console.log(`skip ${tag}: journal row exists`); continue; }
  if (!present) { console.log(`skip ${tag}: baseline tables not present; run drizzle-kit migrate`); continue; }
  psql(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${h}', ${createdAt})`);
  console.log(`seeded ${tag} ${h}`);
}
console.log(psql("SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, id"));