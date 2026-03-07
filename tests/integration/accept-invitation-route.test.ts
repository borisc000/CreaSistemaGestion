import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/request-context", () => ({
  getAuthContext: vi.fn()
}));

vi.mock("@/server/tenancy/repository", () => ({
  getTenantById: vi.fn(),
  getTenantInvitationByTokenHash: vi.fn(),
  listMembershipsByUid: vi.fn(),
  patchTenantInvitation: vi.fn(),
  upsertTenantMembership: vi.fn()
}));

vi.mock("@/server/tenancy/service", () => ({
  buildTenantAccessUrl: vi.fn(() => "https://acme.example.com/dashboard"),
  getPreferredTenantHost: vi.fn(() => Promise.resolve("acme.example.com")),
  hashInvitationToken: vi.fn(() => "hash-1"),
  syncCustomClaimsForMembership: vi.fn()
}));

import { POST } from "@/app/api/auth/accept-invitation/route";
import { getAuthContext } from "@/server/auth/request-context";
import {
  getTenantById,
  getTenantInvitationByTokenHash,
  listMembershipsByUid,
  patchTenantInvitation,
  upsertTenantMembership
} from "@/server/tenancy/repository";
import { syncCustomClaimsForMembership } from "@/server/tenancy/service";

describe("/api/auth/accept-invitation route", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("accepts invitation and activates membership", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      uid: "u-1",
      email: "user@acme.com",
      tenantId: null,
      tenantRole: "viewer",
      platformRole: null,
      role: "viewer",
      host: "acme.example.com",
      resolvedTenantId: "tenant-a",
      memberships: []
    });
    vi.mocked(getTenantInvitationByTokenHash).mockResolvedValue({
      id: "inv-1",
      tenantId: "tenant-a",
      email: "user@acme.com",
      role: "hr",
      status: "pending",
      expiresAt: "2026-12-30T00:00:00.000Z",
      invitedByUid: "owner-1",
      tokenHash: "hash-1",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      acceptedByUid: null,
      acceptedAt: null
    } as never);
    vi.mocked(listMembershipsByUid).mockResolvedValue([]);
    vi.mocked(getTenantById).mockResolvedValue({
      id: "tenant-a",
      name: "Acme",
      slug: "acme",
      status: "active",
      ownerUserId: "owner-1",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      plan: {
        code: "starter",
        status: "active",
        limits: {
          maxUsers: 25,
          enabledModules: ["dashboard"]
        }
      }
    } as never);
    vi.mocked(upsertTenantMembership).mockResolvedValue({
      id: "tenant-a_u-1",
      tenantId: "tenant-a",
      uid: "u-1",
      email: "user@acme.com",
      role: "hr",
      status: "active",
      invitedByUid: "owner-1",
      acceptedAt: "2026-03-07T00:00:00.000Z",
      createdAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z"
    } as never);
    vi.mocked(patchTenantInvitation).mockResolvedValue(undefined);
    vi.mocked(syncCustomClaimsForMembership).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/auth/accept-invitation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: "tok_1234567890"
      })
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.tenant.id).toBe("tenant-a");
    expect(body.data.membership.role).toBe("hr");
    expect(vi.mocked(syncCustomClaimsForMembership)).toHaveBeenCalled();
  });
});
