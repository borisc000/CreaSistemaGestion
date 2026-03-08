import { afterEach, describe, expect, it, vi } from "vitest";

describe("tenant config guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws when ALLOW_DEV_AUTH_BYPASS is enabled in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_AUTH_BYPASS", "true");

    await expect(import("@/lib/tenant")).rejects.toThrow(
      "ALLOW_DEV_AUTH_BYPASS cannot be enabled in production"
    );
  });

  it("loads normally when bypass is disabled", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_AUTH_BYPASS", "false");

    const tenant = await import("@/lib/tenant");
    expect(tenant.ALLOW_DEV_AUTH_BYPASS).toBe(false);
  });
});
