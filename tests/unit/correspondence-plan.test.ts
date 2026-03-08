import { describe, expect, it } from "vitest";
import { buildTenantPlan } from "@/server/tenancy/plans";

describe("correspondence module plan defaults", () => {
  it("keeps correspondencia_cruzada disabled by default for new tenants", () => {
    const plan = buildTenantPlan("starter");
    expect(plan.limits.enabledModules.includes("correspondencia_cruzada")).toBe(false);
  });
});

