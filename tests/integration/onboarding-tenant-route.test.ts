import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/request-context", () => ({
  getAuthContext: vi.fn()
}));

vi.mock("@/server/tenancy/service", () => ({
  buildTenantAccessUrl: vi.fn(() => "https://wolotec.example.com/dashboard"),
  getPreferredTenantHost: vi.fn(() => Promise.resolve("wolotec.example.com")),
  normalizeTenantSlug: vi.fn((slug: string) => slug || "wolotec"),
  onboardTenant: vi.fn()
}));

import { POST } from "@/app/api/onboarding/tenant/route";
import { getAuthContext } from "@/server/auth/request-context";
import { onboardTenant } from "@/server/tenancy/service";

describe("/api/onboarding/tenant route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-platform users", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      uid: "u-1",
      email: "user@wolotec.com",
      role: "tenant_manager",
      tenantRole: "tenant_manager",
      platformRole: null,
      tenantId: "wolotec",
      host: "localhost",
      resolvedTenantId: "wolotec",
      memberships: []
    } as never);

    const req = new NextRequest("http://localhost/api/onboarding/tenant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Nueva Empresa", slug: "nueva-empresa" })
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("Solo platform_admin");
  });

  it("allows platform admin to create tenant", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      uid: "u-platform",
      email: "platform@crea.com",
      role: "platform_admin",
      tenantRole: null,
      platformRole: "platform_admin",
      tenantId: "crea-default",
      host: "localhost",
      resolvedTenantId: "crea-default",
      memberships: []
    } as never);
    vi.mocked(onboardTenant).mockResolvedValue({
      id: "wolotec",
      name: "Wolotec",
      slug: "wolotec",
      status: "active",
      ownerUserId: "u-platform",
      createdAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z",
      plan: {
        code: "starter",
        status: "active",
        limits: {
          maxUsers: 25,
          enabledModules: ["dashboard"]
        }
      }
    } as never);

    const req = new NextRequest("http://localhost/api/onboarding/tenant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Wolotec", slug: "wolotec" })
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.tenant.id).toBe("wolotec");
    expect(body.data.redirectUrl).toContain("wolotec");
  });
});
