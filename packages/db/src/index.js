import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";
const { Pool } = pg;
export function createDb(connectionString) {
    const pool = new Pool({ connectionString });
    const db = drizzle(pool, { schema });
    return { db, pool };
}
export * from "./schema/index.js";
export { seedDevUser, DEV_USER_ID, DEV_USER_EMAIL, DEV_USER_NAME } from "./seed.js";
//# sourceMappingURL=index.js.map