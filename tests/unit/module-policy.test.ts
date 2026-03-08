import { describe, expect, it } from "vitest";
import { buildDefaultModulePolicyMatrix, normalizeModulePolicy, resolveModuleActionAccess } from "../../src/server/auth/module-policy";
import type { TenantRecord } from "../../src/types/domain";

function buildTenant(enabledModules: TenantRecord["plan"]["limits"]["enabledModules"]): TenantRecord {
  return {
    id: "tenant-a",
    name: "Tenant A",
    slug: "tenant-a",
    status: "active",
    ownerUserId: "owner-1",
    createdAt: "2026-03-08T00:00:00.000Z",
    updatedAt: "2026-03-08T00:00:00.000Z",
    plan: {
      code: "starter",
      status: "active",
      limits: {
        maxUsers: 25,
        enabledModules
      }
    }
  };
}

describe("module policy", () => {
  it("keeps platform_admin read/write enabled for platform module", () => {
    const policy = normalizeModulePolicy({
      modules: {
        platform: {
          platform_admin: {
            read: false,
            write: false
          }
        }
      }
    });

    expect(policy.modules.platform.platform_admin.read).toBe(true);
    expect(policy.modules.platform.platform_admin.write).toBe(true);
  });

  it("applies intersection of static role access, policy and tenant enabled modules", () => {
    const tenant = buildTenant(["dashboard", "finance", "contracts"]);
    const policy = normalizeModulePolicy({
      modules: {
        finance: {
          finance: {
            read: false,
            write: false
          }
        }
      }
    });

    expect(
      resolveModuleActionAccess({
        moduleKey: "finance",
        role: "finance",
        action: "read",
        tenant,
        policy
      })
    ).toBe(false);
  });

  it("denies access when tenant plan does not enable the module", () => {
    const tenant = buildTenant(["dashboard"]);
    const policy = {
      modules: buildDefaultModulePolicyMatrix(),
      updatedAt: null,
      updatedByUid: null
    };

    expect(
      resolveModuleActionAccess({
        moduleKey: "finance",
        role: "finance",
        action: "read",
        tenant,
        policy
      })
    ).toBe(false);
  });

  it("does not allow policy escalation beyond static registry permissions", () => {
    const tenant = buildTenant(["dashboard", "finance"]);
    const policy = normalizeModulePolicy({
      modules: {
        finance: {
          viewer: {
            read: true,
            write: true
          }
        }
      }
    });

    expect(
      resolveModuleActionAccess({
        moduleKey: "finance",
        role: "viewer",
        action: "read",
        tenant,
        policy
      })
    ).toBe(false);
  });
});
