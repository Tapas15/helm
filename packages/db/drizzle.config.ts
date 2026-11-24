import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/helm" },
  strict: true,
  migrations: { table: '__drizzle_migrations', schema: 'drizzle' },
});
