import { describe, expect, it } from "vitest";
import { hasModuleAccess } from "../../src/server/auth/roles";

describe("hasModuleAccess", () => {
  it("allows finance module for finance role", () => {
    expect(hasModuleAccess("finance", "finance")).toBe(true);
  });

  it("denies hr modules to tender lead", () => {
    expect(hasModuleAccess("tender_lead", "hr_people")).toBe(false);
  });

  it("allows all modules for admin", () => {
    expect(hasModuleAccess("admin", "operations")).toBe(true);
    expect(hasModuleAccess("admin", "hr_recruiting")).toBe(true);
    expect(hasModuleAccess("admin", "admin_users")).toBe(true);
    expect(hasModuleAccess("admin", "audit")).toBe(true);
  });

  it("denies admin modules for non-admin roles", () => {
    expect(hasModuleAccess("finance", "admin_users")).toBe(false);
    expect(hasModuleAccess("viewer", "audit")).toBe(false);
  });
});
