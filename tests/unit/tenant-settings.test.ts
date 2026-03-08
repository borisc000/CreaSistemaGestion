import { describe, expect, it } from "vitest";
import { mergeTenantSettings, resolveTenantSettings } from "../../src/server/tenancy/settings";

describe("tenant settings", () => {
  it("defaults currency to CLP when tenant has no settings", () => {
    const settings = resolveTenantSettings(null);
    expect(settings.company.currency).toBe("CLP");
  });

  it("preserves existing settings and applies currency patch", () => {
    const merged = mergeTenantSettings(
      {
        company: {
          currency: "CLP"
        }
      },
      {
        company: {
          currency: "USD"
        }
      }
    );

    expect(merged.company?.currency).toBe("USD");
  });
});
