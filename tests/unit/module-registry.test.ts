import { describe, expect, it } from "vitest";
import { buildNavItemsFromModules } from "../../src/features/layout/nav-config";
import { getEnabledModules, MODULE_KEYS, MODULE_REGISTRY, type RegisteredModule } from "../../src/modules/registry";
import { canViewModule, hasModuleAccess } from "../../src/server/auth/roles";

describe("module registry", () => {
  it("has stable keys and matching moduleKey values", () => {
    for (const moduleKey of MODULE_KEYS) {
      expect(MODULE_REGISTRY[moduleKey].moduleKey).toBe(moduleKey);
    }
  });

  it("keeps unique enabled routes", () => {
    const routes = getEnabledModules().map((moduleDefinition) => moduleDefinition.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("uses primaryCollection only within collectionKeys", () => {
    for (const moduleDefinition of getEnabledModules()) {
      if (!moduleDefinition.primaryCollection) continue;
      expect(moduleDefinition.collectionKeys.includes(moduleDefinition.primaryCollection)).toBe(true);
    }
  });

  it("allows cross-module read while preserving hidden navigation", () => {
    expect(hasModuleAccess("finance", "contracts", "read")).toBe(true);
    expect(hasModuleAccess("finance", "contracts", "write")).toBe(false);
    expect(canViewModule("finance", "contracts")).toBe(false);
  });

  it("keeps correspondencia_cruzada restricted to admins", () => {
    expect(hasModuleAccess("tenant_admin", "correspondencia_cruzada", "read")).toBe(true);
    expect(hasModuleAccess("hr", "correspondencia_cruzada", "read")).toBe(false);
    expect(canViewModule("tenant_admin", "correspondencia_cruzada")).toBe(true);
  });

  it("omits disabled modules from navigation generation", () => {
    const enabledModules = getEnabledModules();
    const shadowModule = {
      ...enabledModules[0],
      moduleKey: "dashboard-shadow",
      route: "/dashboard-shadow",
      enabled: false,
      navigation: {
        label: "Shadow",
        href: "/dashboard-shadow",
        order: 999,
        visibleForRoles: ["tenant_admin"]
      }
    } as unknown as RegisteredModule;

    const navItems = buildNavItemsFromModules([...(enabledModules as RegisteredModule[]), shadowModule]);
    const navHrefs = navItems.flatMap((item) => [item.href, ...(item.children || []).map((child) => child.href)]);

    expect(navHrefs).not.toContain("/dashboard-shadow");
  });
});
