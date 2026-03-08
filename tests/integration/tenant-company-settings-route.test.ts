import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/request-context", () => ({
  getTenantContext: vi.fn()
}));

vi.mock("@/server/tenancy/repository", () => ({
  getTenantById: vi.fn(),
  patchTenant: vi.fn()
}));

import { GET, PATCH } from "@/app/api/tenant/settings/company/route";
import { getTenantContext } from "@/server/auth/request-context";
import { getTenantById, patchTenant } from "@/server/tenancy/repository";

describe("/api/tenant/settings/company route", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("returns default CLP when company settings are missing", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "admin-1",
      role: "tenant_admin",
      email: "admin@acme.com",
      platformRole: null
    } as never);
    vi.mocked(getTenantById).mockResolvedValue({
      id: "tenant-a",
      name: "Tenant A",
      slug: "tenant-a",
      status: "active",
      ownerUserId: "admin-1",
      createdAt: "2026-03-08T00:00:00.000Z",
      updatedAt: "2026-03-08T00:00:00.000Z",
      plan: {
        code: "starter",
        status: "active",
        limits: {
          maxUsers: 25,
          enabledModules: ["dashboard", "admin_users"]
        }
      }
    } as never);

    const req = new NextRequest("http://localhost/api/tenant/settings/company");
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.company.currency).toBe("CLP");
  });

  it("updates currency for tenant_admin", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "admin-1",
      role: "tenant_admin",
      email: "admin@acme.com",
      platformRole: null
    } as never);
    vi.mocked(getTenantById).mockResolvedValue({
      id: "tenant-a",
      name: "Tenant A",
      slug: "tenant-a",
      status: "active",
      ownerUserId: "admin-1",
      createdAt: "2026-03-08T00:00:00.000Z",
      updatedAt: "2026-03-08T00:00:00.000Z",
      settings: {
        company: {
          currency: "CLP"
        }
      },
      plan: {
        code: "starter",
        status: "active",
        limits: {
          maxUsers: 25,
          enabledModules: ["dashboard", "admin_users"]
        }
      }
    } as never);
    vi.mocked(patchTenant).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/tenant/settings/company", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currency: "USD" })
    });
    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.company.currency).toBe("USD");
    expect(vi.mocked(patchTenant)).toHaveBeenCalledWith(
      "tenant-a",
      expect.objectContaining({
        settings: expect.objectContaining({
          company: expect.objectContaining({ currency: "USD" })
        })
      })
    );
  });

  it("rejects updates from tenant_manager", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "manager-1",
      role: "tenant_manager",
      email: "manager@acme.com",
      platformRole: null
    } as never);

    const req = new NextRequest("http://localhost/api/tenant/settings/company", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currency: "USD" })
    });
    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("tenant_admin or platform_admin");
  });
});
