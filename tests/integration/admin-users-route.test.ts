import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/server/api/response";

vi.mock("@/server/auth/request-context", () => ({
  getTenantContext: vi.fn()
}));

vi.mock("@/server/tenancy/repository", () => ({
  getTenantMembership: vi.fn(),
  listTenantMemberships: vi.fn(),
  upsertTenantMembership: vi.fn()
}));

vi.mock("@/server/tenancy/service", () => ({
  syncCustomClaimsForMembership: vi.fn()
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: {
    getUser: vi.fn()
  }
}));

import { GET, PATCH } from "@/app/api/admin/users/route";
import { getTenantContext } from "@/server/auth/request-context";
import { adminAuth } from "@/lib/firebase/admin";
import { getTenantMembership, listTenantMemberships, upsertTenantMembership } from "@/server/tenancy/repository";
import { syncCustomClaimsForMembership } from "@/server/tenancy/service";

describe("/api/admin/users route", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("lists tenant users", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "tenant_admin",
      email: "owner@acme.com"
    });
    vi.mocked(listTenantMemberships).mockResolvedValue([
      {
        id: "tenant-a_u-1",
        tenantId: "tenant-a",
        uid: "u-1",
        email: "hr@acme.com",
        role: "hr",
        status: "active",
        invitedByUid: null,
        acceptedAt: "2026-03-06T00:00:00.000Z",
        createdAt: "2026-03-06T00:00:00.000Z",
        updatedAt: "2026-03-06T00:00:00.000Z"
      }
    ] as never);
    vi.mocked(adminAuth.getUser).mockResolvedValue({
      disabled: false,
      displayName: "RRHH",
      metadata: { lastSignInTime: "2026-03-06T00:00:00.000Z" }
    } as never);

    const req = new NextRequest("http://localhost/api/admin/users");
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].role).toBe("hr");
    expect(body.data[0].tenantId).toBe("tenant-a");
  });

  it("returns 403 when context rejects access", async () => {
    vi.mocked(getTenantContext).mockRejectedValue(new ApiError(403, "forbidden"));

    const req = new NextRequest("http://localhost/api/admin/users");
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("forbidden");
  });

  it("updates tenant role on PATCH", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "tenant_admin",
      email: "owner@acme.com"
    });
    vi.mocked(getTenantMembership).mockResolvedValue({
      id: "tenant-a_u-1",
      tenantId: "tenant-a",
      uid: "u-1",
      email: "hr@acme.com",
      role: "viewer",
      status: "active",
      invitedByUid: null,
      acceptedAt: "2026-03-06T00:00:00.000Z",
      createdAt: "2026-03-06T00:00:00.000Z",
      updatedAt: "2026-03-06T00:00:00.000Z"
    } as never);
    vi.mocked(upsertTenantMembership).mockResolvedValue({
      id: "tenant-a_u-1",
      tenantId: "tenant-a",
      uid: "u-1",
      email: "hr@acme.com",
      role: "hr",
      status: "active",
      invitedByUid: null,
      acceptedAt: "2026-03-06T00:00:00.000Z",
      createdAt: "2026-03-06T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z"
    } as never);
    vi.mocked(syncCustomClaimsForMembership).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        uid: "u-1",
        role: "hr"
      })
    });

    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(vi.mocked(syncCustomClaimsForMembership)).toHaveBeenCalled();
  });
});
