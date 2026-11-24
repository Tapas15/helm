import { createDb } from "./index.js";
import { users } from "./schema/index.js";

export const DEV_USER_ID = "usr_local_dev";
export const DEV_USER_EMAIL = "dev@helm.local";
export const DEV_USER_NAME = "Local Dev";

export async function seedDevUser(connectionString?: string) {
  const dbUrl =
    connectionString ??
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/helm";
  const { db, pool } = createDb(dbUrl);
  try {
    await db
      .insert(users)
      .values({
        id: DEV_USER_ID,
        email: DEV_USER_EMAIL,
        name: DEV_USER_NAME,
      })
      .onConflictDoNothing({ target: users.id });
    return { id: DEV_USER_ID, email: DEV_USER_EMAIL, name: DEV_USER_NAME };
  } finally {
    await pool.end();
  }
}

async function main() {
  // @ts-expect-error - dotenv optional at runtime in dist
  const mod = await import("dotenv");
  mod.config?.();
  const result = await seedDevUser();
  process.stdout.write(`Seeded idempotent dev user: ${result.id} (${result.email})\n`);
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("/seed.js");
if (isDirectRun) {
  main().catch((err) => {
    process.stderr.write(`Seed failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
