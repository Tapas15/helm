import { and, eq } from "drizzle-orm";
import { connectorAccounts, identityPolicies, type Database } from "@helm/db";
import { HELM_ERROR_CODES } from "@helm/shared";

export type IdentityPolicyDecision = { ok: true; policyId?: string } | { ok: false; status: 403 | 409; code: string; message: string };

export async function enforceIdentityPolicyForConnectorAccount(db: Database, userId: string, accountId: string, actionKind: string): Promise<IdentityPolicyDecision> {
  const [account] = await db.select({ id: connectorAccounts.id, metadata: connectorAccounts.metadata }).from(connectorAccounts).where(and(eq(connectorAccounts.id, accountId), eq(connectorAccounts.userId, userId))).limit(1);
  const identityId = account && typeof (account.metadata as any)?.identityId === "string" ? String((account.metadata as any).identityId) : null;
  const enforce = process.env.HELM_IDENTITY_ENFORCEMENT === "1";
  if (!identityId) {
    if (enforce) return { ok: false, status: 403, code: HELM_ERROR_CODES.FORBIDDEN, message: "Identity enforcement enabled: connector account has no bound identityId" };
    return { ok: true };
  }
  const [policy] = await db.select().from(identityPolicies).where(and(eq(identityPolicies.identityId, identityId), eq(identityPolicies.userId, userId))).limit(1);
  if (!policy) {
    if (enforce) return { ok: false, status: 403, code: HELM_ERROR_CODES.FORBIDDEN, message: "Identity enforcement enabled: no identity policy found" };
    return { ok: true };
  }
  if (!policy.allowExternalWrites) return { ok: false, status: 403, code: HELM_ERROR_CODES.FORBIDDEN, message: `Identity policy denies external writes (${actionKind})` };
  if (!policy.requireApproval) return { ok: false, status: 403, code: HELM_ERROR_CODES.FORBIDDEN, message: "Identity policy invalid: external writes require approval" };
  return { ok: true, policyId: policy.id };
}
