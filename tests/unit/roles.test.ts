import { describe, expect, it } from "vitest";
import { hasModuleAccess } from "../../src/server/auth/roles";

describe("hasModuleAccess", () => {
  it("allows finance module for finance role", () => {
    expect(hasModuleAccess("finance", "finance")).toBe(true);
  });

  it("denies hr modules to tender lead", () => {
    expect(hasModuleAccess("tender_lead", "hr_people")).toBe(false);
  });

  it("allows core modules for tenant admin", () => {
    expect(hasModuleAccess("tenant_admin", "operations")).toBe(true);
    expect(hasModuleAccess("tenant_admin", "hr_recruiting")).toBe(true);
    expect(hasModuleAccess("tenant_admin", "admin_users")).toBe(true);
    expect(hasModuleAccess("tenant_admin", "audit")).toBe(true);
  });

  it("denies admin modules for non-admin roles", () => {
    expect(hasModuleAccess("finance", "admin_users")).toBe(false);
    expect(hasModuleAccess("viewer", "audit")).toBe(false);
  });

  it("allows platform module only for platform admin", () => {
    expect(hasModuleAccess("platform_admin", "platform")).toBe(true);
    expect(hasModuleAccess("tenant_admin", "platform")).toBe(false);
  });
});
