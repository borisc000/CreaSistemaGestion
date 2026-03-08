import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/request-context", () => ({
  getTenantContext: vi.fn()
}));

vi.mock("@/server/tenancy/repository", () => ({
  createTenantWithOwnerMembership: vi.fn(),
  deleteTenantHard: vi.fn(),
  getTenantById: vi.fn(),
  getTenantMembership: vi.fn(),
  listTenants: vi.fn(),
  patchTenant: vi.fn(),
  upsertTenantMembership: vi.fn()
}));

vi.mock("@/server/tenancy/service", () => ({
  ensureTenantCapacity: vi.fn(),
  normalizeTenantSlug: vi.fn((slug: string) => slug),
  syncCustomClaimsForMembership: vi.fn()
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: {
    getUserByEmail: vi.fn()
  }
}));

import { PATCH, POST } from "@/app/api/platform/tenants/route";
import { adminAuth } from "@/lib/firebase/admin";
import { getTenantContext } from "@/server/auth/request-context";
import {
  createTenantWithOwnerMembership,
  deleteTenantHard,
  getTenantById,
  getTenantMembership,
  patchTenant,
  upsertTenantMembership
} from "@/server/tenancy/repository";
import { ensureTenantCapacity, normalizeTenantSlug, syncCustomClaimsForMembership } from "@/server/tenancy/service";

describe("/api/platform/tenants route", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("assigns user to tenant by email and role", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "crea-default",
      uid: "platform-1",
      role: "platform_admin",
      email: "platform@acme.com",
      platformRole: "platform_admin"
    } as never);
    vi.mocked(getTenantById).mockResolvedValue({
      id: "wolotec",
      name: "Wolotec",
      slug: "wolotec",
      status: "active",
      ownerUserId: null,
      createdAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z",
      plan: {
        code: "enterprise",
        status: "active",
        limits: {
          maxUsers: 500,
          enabledModules: ["dashboard"]
        }
      }
    } as never);
    vi.mocked(adminAuth.getUserByEmail).mockResolvedValue({
      uid: "u-pedro",
      email: "srwpedro@gmail.com"
    } as never);
    vi.mocked(getTenantMembership).mockResolvedValue(null);
    vi.mocked(upsertTenantMembership).mockResolvedValue({
      id: "wolotec_u-pedro",
      tenantId: "wolotec",
      uid: "u-pedro",
      email: "srwpedro@gmail.com",
      role: "tenant_manager",
      status: "active",
      invitedByUid: "platform-1",
      acceptedAt: "2026-03-07T00:00:00.000Z",
      createdAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z"
    } as never);
    vi.mocked(syncCustomClaimsForMembership).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/platform/tenants", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "wolotec",
        action: "assign_user",
        email: "srwpedro@gmail.com",
        role: "tenant_manager"
      })
    });

    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.tenantId).toBe("wolotec");
    expect(body.data.role).toBe("tenant_manager");
    expect(vi.mocked(ensureTenantCapacity)).toHaveBeenCalledWith("wolotec");
    expect(vi.mocked(upsertTenantMembership)).toHaveBeenCalled();
    expect(vi.mocked(syncCustomClaimsForMembership)).toHaveBeenCalled();
  });

  it("does not re-check capacity when user already has active membership", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "crea-default",
      uid: "platform-1",
      role: "platform_admin",
      email: "platform@acme.com",
      platformRole: "platform_admin"
    } as never);
    vi.mocked(getTenantById).mockResolvedValue({
      id: "wolotec",
      name: "Wolotec",
      slug: "wolotec",
      status: "active",
      ownerUserId: "u-owner",
      createdAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z",
      plan: {
        code: "enterprise",
        status: "active",
        limits: {
          maxUsers: 500,
          enabledModules: ["dashboard"]
        }
      }
    } as never);
    vi.mocked(adminAuth.getUserByEmail).mockResolvedValue({
      uid: "u-pedro",
      email: "srwpedro@gmail.com"
    } as never);
    vi.mocked(getTenantMembership).mockResolvedValue({
      id: "wolotec_u-pedro",
      tenantId: "wolotec",
      uid: "u-pedro",
      email: "srwpedro@gmail.com",
      role: "viewer",
      status: "active",
      invitedByUid: "platform-1",
      acceptedAt: "2026-03-07T00:00:00.000Z",
      createdAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z"
    } as never);
    vi.mocked(upsertTenantMembership).mockResolvedValue({
      id: "wolotec_u-pedro",
      tenantId: "wolotec",
      uid: "u-pedro",
      email: "srwpedro@gmail.com",
      role: "finance",
      status: "active",
      invitedByUid: "platform-1",
      acceptedAt: "2026-03-07T00:00:00.000Z",
      createdAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z"
    } as never);
    vi.mocked(syncCustomClaimsForMembership).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/platform/tenants", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "wolotec",
        action: "assign_user",
        email: "srwpedro@gmail.com",
        role: "finance"
      })
    });

    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(vi.mocked(ensureTenantCapacity)).not.toHaveBeenCalled();
  });

  it("creates tenant and owner membership in one repository call", async () => {
    vi.mocked(normalizeTenantSlug).mockImplementation((slug) => slug);
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "crea-default",
      uid: "platform-1",
      role: "platform_admin",
      email: "platform@acme.com",
      platformRole: "platform_admin"
    } as never);
    vi.mocked(adminAuth.getUserByEmail).mockResolvedValue({
      uid: "u-owner",
      email: "owner@acme.com"
    } as never);
    vi.mocked(createTenantWithOwnerMembership).mockResolvedValue({
      tenant: {
        id: "acme",
        name: "Acme",
        slug: "acme",
        status: "active",
        ownerUserId: "u-owner",
        createdAt: "2026-03-08T00:00:00.000Z",
        updatedAt: "2026-03-08T00:00:00.000Z",
        plan: {
          code: "starter",
          status: "active",
          limits: {
            maxUsers: 25,
            enabledModules: ["dashboard"]
          }
        }
      },
      membership: {
        id: "acme_u-owner",
        tenantId: "acme",
        uid: "u-owner",
        email: "owner@acme.com",
        role: "tenant_admin",
        status: "active",
        invitedByUid: "platform-1",
        acceptedAt: "2026-03-08T00:00:00.000Z",
        createdAt: "2026-03-08T00:00:00.000Z",
        updatedAt: "2026-03-08T00:00:00.000Z"
      },
      domain: {
        id: "acme.example.com",
        tenantId: "acme",
        host: "acme.example.com",
        type: "wildcard",
        verified: true,
        status: "active",
        createdAt: "2026-03-08T00:00:00.000Z",
        updatedAt: "2026-03-08T00:00:00.000Z"
      }
    } as never);
    vi.mocked(syncCustomClaimsForMembership).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/platform/tenants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Acme",
        slug: "acme",
        ownerEmail: "owner@acme.com"
      })
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.id).toBe("acme");
    expect(vi.mocked(createTenantWithOwnerMembership)).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant: expect.objectContaining({ id: "acme", ownerUserId: "u-owner" }),
        membership: expect.objectContaining({ uid: "u-owner" })
      })
    );
  });

  it("deletes suspended tenant when confirmation slug matches", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "crea-default",
      uid: "platform-1",
      role: "platform_admin",
      email: "platform@acme.com",
      platformRole: "platform_admin"
    } as never);
    vi.mocked(getTenantById).mockResolvedValue({
      id: "admin",
      name: "Admin",
      slug: "admin",
      status: "suspended",
      ownerUserId: null,
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
    vi.mocked(deleteTenantHard).mockResolvedValue({
      deletedTenantScoped: 0,
      deletedMemberships: 2,
      deletedInvitations: 0,
      deletedDomains: 1
    });

    const req = new NextRequest("http://localhost/api/platform/tenants", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "admin",
        action: "delete",
        confirmSlug: "admin"
      })
    });

    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.tenantId).toBe("admin");
    expect(vi.mocked(deleteTenantHard)).toHaveBeenCalledWith("admin");
  });

  it("rejects delete for active tenant", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "crea-default",
      uid: "platform-1",
      role: "platform_admin",
      email: "platform@acme.com",
      platformRole: "platform_admin"
    } as never);
    vi.mocked(getTenantById).mockResolvedValue({
      id: "wolotec",
      name: "Wolotec",
      slug: "wolotec",
      status: "active",
      ownerUserId: null,
      createdAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z",
      plan: {
        code: "enterprise",
        status: "active",
        limits: {
          maxUsers: 500,
          enabledModules: ["dashboard"]
        }
      }
    } as never);

    const req = new NextRequest("http://localhost/api/platform/tenants", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "wolotec",
        action: "delete",
        confirmSlug: "wolotec"
      })
    });

    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("primero debes suspender");
  });

  it("updates enabled modules without overriding existing maxUsers", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "crea-default",
      uid: "platform-1",
      role: "platform_admin",
      email: "platform@acme.com",
      platformRole: "platform_admin"
    } as never);
    vi.mocked(getTenantById).mockResolvedValue({
      id: "wolotec",
      name: "Wolotec",
      slug: "wolotec",
      status: "active",
      ownerUserId: null,
      createdAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z",
      plan: {
        code: "pro",
        status: "active",
        limits: {
          maxUsers: 77,
          enabledModules: ["dashboard", "contracts", "hr_people"]
        }
      }
    } as never);

    const req = new NextRequest("http://localhost/api/platform/tenants", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "wolotec",
        enabledModules: ["dashboard", "contracts"]
      })
    });

    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(vi.mocked(patchTenant)).toHaveBeenCalledWith(
      "wolotec",
      expect.objectContaining({
        status: "active",
        plan: expect.objectContaining({
          code: "pro",
          limits: expect.objectContaining({
            maxUsers: 77,
            enabledModules: ["dashboard", "contracts"]
          })
        })
      })
    );
  });
});
