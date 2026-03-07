import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/request-context", () => ({
  getAuthContext: vi.fn()
}));

vi.mock("@/server/tenancy/repository", () => ({
  getTenantById: vi.fn(),
  getTenantMembership: vi.fn()
}));

vi.mock("@/server/tenancy/service", () => ({
  buildTenantAccessUrl: vi.fn(() => "https://acme.example.com/dashboard"),
  getPreferredTenantHost: vi.fn(() => Promise.resolve("acme.example.com")),
  syncCustomClaimsForMembership: vi.fn()
}));

import { POST } from "@/app/api/auth/switch-tenant/route";
import { getAuthContext } from "@/server/auth/request-context";
import { getTenantById, getTenantMembership } from "@/server/tenancy/repository";
import { syncCustomClaimsForMembership } from "@/server/tenancy/service";

describe("/api/auth/switch-tenant route", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("switches active tenant when membership exists", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      uid: "u-1",
      email: "user@acme.com",
      tenantId: "tenant-a",
      tenantRole: "viewer",
      platformRole: null,
      role: "viewer",
      host: "localhost",
      resolvedTenantId: null,
      memberships: []
    });
    vi.mocked(getTenantMembership).mockResolvedValue({
      id: "tenant-b_u-1",
      tenantId: "tenant-b",
      uid: "u-1",
      email: "user@acme.com",
      role: "hr",
      status: "active",
      invitedByUid: null,
      acceptedAt: "2026-03-07T00:00:00.000Z",
      createdAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z"
    } as never);
    vi.mocked(getTenantById).mockResolvedValue({
      id: "tenant-b",
      name: "Beta",
      slug: "beta",
      status: "active",
      ownerUserId: "u-1",
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
    vi.mocked(syncCustomClaimsForMembership).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/auth/switch-tenant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant-b" })
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.tenant.id).toBe("tenant-b");
    expect(vi.mocked(syncCustomClaimsForMembership)).toHaveBeenCalled();
  });
});
