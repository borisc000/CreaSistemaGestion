import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/request-context", () => ({
  getTenantContext: vi.fn()
}));

vi.mock("@/server/tenancy/repository", () => ({
  createTenantInvitation: vi.fn(),
  getTenantById: vi.fn(),
  getTenantInvitationById: vi.fn(),
  listTenantInvitations: vi.fn(),
  patchTenantInvitation: vi.fn(),
  upsertTenantMembership: vi.fn()
}));

vi.mock("@/server/tenancy/service", () => ({
  buildInvitationExpiryDate: vi.fn(() => "2026-03-15T00:00:00.000Z"),
  buildTenantAccessUrl: vi.fn(() => "https://acme.example.com/invitacion/aceptar?token=abc"),
  ensureTenantCapacity: vi.fn(),
  generateInvitationToken: vi.fn(() => ({ token: "abc", tokenHash: "hash-1" })),
  getPreferredTenantHost: vi.fn(() => Promise.resolve("acme.example.com")),
  sendInvitationEmail: vi.fn(() => Promise.resolve({ sent: true, providerId: "mail-1" })),
  syncCustomClaimsForMembership: vi.fn()
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: {
    getUserByEmail: vi.fn()
  }
}));

import { GET, POST, PATCH } from "@/app/api/tenant/invitations/route";
import { adminAuth } from "@/lib/firebase/admin";
import { getTenantContext } from "@/server/auth/request-context";
import {
  createTenantInvitation,
  getTenantById,
  getTenantInvitationById,
  listTenantInvitations,
  patchTenantInvitation,
  upsertTenantMembership
} from "@/server/tenancy/repository";
import { syncCustomClaimsForMembership } from "@/server/tenancy/service";

describe("/api/tenant/invitations route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates invitation and returns shareable link", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "tenant_admin",
      email: "owner@acme.com"
    });
    vi.mocked(getTenantById).mockResolvedValue({
      id: "tenant-a",
      name: "Acme",
      slug: "acme",
      status: "active",
      ownerUserId: "caller-1",
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
    vi.mocked(createTenantInvitation).mockResolvedValue({
      id: "inv-1",
      tenantId: "tenant-a",
      email: "new@acme.com",
      role: "viewer",
      status: "pending",
      expiresAt: "2026-03-15T00:00:00.000Z",
      invitedByUid: "caller-1",
      tokenHash: "hash-1",
      createdAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z",
      acceptedByUid: null,
      acceptedAt: null
    } as never);
    vi.mocked(adminAuth.getUserByEmail).mockRejectedValue(new Error("not-found"));

    const req = new NextRequest("http://localhost/api/tenant/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "new@acme.com",
        role: "viewer"
      })
    });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.email).toBe("new@acme.com");
    expect(body.inviteUrl).toContain("invitacion/aceptar");
  });

  it("auto-assigns existing auth user and marks invitation accepted", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "tenant_admin",
      email: "owner@acme.com"
    });
    vi.mocked(getTenantById).mockResolvedValue({
      id: "tenant-a",
      name: "Acme",
      slug: "acme",
      status: "active",
      ownerUserId: "caller-1",
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
    vi.mocked(createTenantInvitation).mockResolvedValue({
      id: "inv-2",
      tenantId: "tenant-a",
      email: "existing@acme.com",
      role: "finance",
      status: "pending",
      expiresAt: "2026-03-15T00:00:00.000Z",
      invitedByUid: "caller-1",
      tokenHash: "hash-1",
      createdAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z",
      acceptedByUid: null,
      acceptedAt: null
    } as never);
    vi.mocked(adminAuth.getUserByEmail).mockResolvedValue({
      uid: "u-existing",
      email: "existing@acme.com"
    } as never);
    vi.mocked(upsertTenantMembership).mockResolvedValue({
      id: "tenant-a_u-existing",
      tenantId: "tenant-a",
      uid: "u-existing",
      email: "existing@acme.com",
      role: "finance",
      status: "active",
      invitedByUid: "caller-1",
      acceptedAt: "2026-03-07T00:00:00.000Z",
      createdAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z"
    } as never);
    vi.mocked(patchTenantInvitation).mockResolvedValue(undefined);
    vi.mocked(syncCustomClaimsForMembership).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/tenant/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "existing@acme.com",
        role: "finance"
      })
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.autoAssigned).toBe(true);
    expect(body.data.status).toBe("accepted");
    expect(vi.mocked(upsertTenantMembership)).toHaveBeenCalled();
    expect(vi.mocked(syncCustomClaimsForMembership)).toHaveBeenCalled();
  });

  it("blocks tenant manager from inviting tenant admin role", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-2",
      role: "tenant_manager",
      email: "manager@acme.com"
    });

    const req = new NextRequest("http://localhost/api/tenant/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "next@acme.com",
        role: "tenant_admin"
      })
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("no puede invitar");
  });

  it("lists invitations for tenant", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "tenant_admin",
      email: "owner@acme.com"
    });
    vi.mocked(listTenantInvitations).mockResolvedValue([
      {
        id: "inv-1",
        tenantId: "tenant-a",
        email: "new@acme.com",
        role: "viewer",
        status: "pending",
        expiresAt: "2026-03-15T00:00:00.000Z",
        invitedByUid: "caller-1",
        tokenHash: "hash-1",
        createdAt: "2026-03-07T00:00:00.000Z",
        updatedAt: "2026-03-07T00:00:00.000Z",
        acceptedByUid: null,
        acceptedAt: null
      }
    ] as never);

    const req = new NextRequest("http://localhost/api/tenant/invitations");
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });

  it("revokes invitation", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "tenant_admin",
      email: "owner@acme.com"
    });
    vi.mocked(getTenantInvitationById).mockResolvedValue({
      id: "inv-1",
      tenantId: "tenant-a",
      email: "new@acme.com",
      role: "viewer",
      status: "pending",
      expiresAt: "2026-03-15T00:00:00.000Z",
      invitedByUid: "caller-1",
      tokenHash: "hash-1",
      createdAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z",
      acceptedByUid: null,
      acceptedAt: null
    } as never);
    vi.mocked(patchTenantInvitation).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/tenant/invitations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "inv-1",
        action: "revoke"
      })
    });
    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
