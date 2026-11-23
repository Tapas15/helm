import * as schema from "./schema/index.js";
export declare function createDb(connectionString: string): {
    db: import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
        $client: import("pg").Pool;
    };
    pool: import("pg").Pool;
};
export type Database = ReturnType<typeof createDb>["db"];
export * from "./schema/index.js";
export { seedDevUser, DEV_USER_ID, DEV_USER_EMAIL, DEV_USER_NAME } from "./seed.js";
//# sourceMappingURL=index.d.ts.map