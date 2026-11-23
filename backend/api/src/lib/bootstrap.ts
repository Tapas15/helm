import type { Database } from "@helm/db";
import { DEV_USER_EMAIL, DEV_USER_ID, DEV_USER_NAME, users } from "@helm/db";
import type { HelmLogger } from "@helm/observability";

export interface BootstrapResult {
  devUserId: string;
  inserted: boolean;
}

export async function ensureDevUser(db: Database, logger?: HelmLogger): Promise<BootstrapResult> {
  const [row] = await db
    .insert(users)
    .values({
      id: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      name: DEV_USER_NAME,
    })
    .onConflictDoNothing({ target: users.id })
    .returning({ id: users.id });

  const inserted = Boolean(row?.id);
  logger?.info({ userId: DEV_USER_ID, inserted }, "dev user bootstrap ensured");
  return { devUserId: DEV_USER_ID, inserted };
}
