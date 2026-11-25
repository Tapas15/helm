import { describe, expect, it, afterEach } from "vitest";
import { enforceIdentityPolicyForConnectorAccount } from "./identity-policy.js";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

function fakeDb(account: any, policy: any) {
  let call = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            call += 1;
            return call === 1 ? (account ? [account] : []) : (policy ? [policy] : []);
          },
        }),
      }),
    }),
  } as any;
}

describe("enforceIdentityPolicyForConnectorAccount", () => {
  it("allows when no identity bound and enforcement off", async () => {
    delete process.env.HELM_IDENTITY_ENFORCEMENT;
    const r = await enforceIdentityPolicyForConnectorAccount(fakeDb({ id: "a1", metadata: {} }, null), "u1", "a1", "gmail.send");
    expect(r.ok).toBe(true);
  });
  it("denies when no identity bound and enforcement on", async () => {
    process.env.HELM_IDENTITY_ENFORCEMENT = "1";
    const r = await enforceIdentityPolicyForConnectorAccount(fakeDb({ id: "a1", metadata: {} }, null), "u1", "a1", "gmail.send");
    expect(r.ok).toBe(false);
  });
  it("denies when policy disallows external writes", async () => {
    process.env.HELM_IDENTITY_ENFORCEMENT = "1";
    const r = await enforceIdentityPolicyForConnectorAccount(fakeDb({ id: "a1", metadata: { identityId: "i1" } }, { id: "p1", allowExternalWrites: false, requireApproval: true }), "u1", "a1", "gmail.send");
    expect(r.ok).toBe(false);
  });
  it("allows valid policy", async () => {
    process.env.HELM_IDENTITY_ENFORCEMENT = "1";
    const r = await enforceIdentityPolicyForConnectorAccount(fakeDb({ id: "a1", metadata: { identityId: "i1" } }, { id: "p1", allowExternalWrites: true, requireApproval: true }), "u1", "a1", "gmail.send");
    expect(r).toEqual({ ok: true, policyId: "p1" });
  });
  it("denies recipient when allowlists configured", async () => {
    process.env.HELM_IDENTITY_ENFORCEMENT = "1";
    const r = await enforceIdentityPolicyForConnectorAccount(fakeDb({ id: "a1", metadata: { identityId: "i1" } }, { id: "p1", allowExternalWrites: true, requireApproval: true, allowedRecipients: ["ok@example.com"], allowedDomains: ["safe.com"] }), "u1", "a1", "gmail.send", { recipients: ["bad@other.com"] });
    expect(r.ok).toBe(false);
  });
  it("allows recipient by domain allowlist", async () => {
    process.env.HELM_IDENTITY_ENFORCEMENT = "1";
    const r = await enforceIdentityPolicyForConnectorAccount(fakeDb({ id: "a1", metadata: { identityId: "i1" } }, { id: "p1", allowExternalWrites: true, requireApproval: true, allowedRecipients: [], allowedDomains: ["safe.com"] }), "u1", "a1", "gmail.send", { recipients: ["user@safe.com"] });
    expect(r).toEqual({ ok: true, policyId: "p1" });
  });
});
