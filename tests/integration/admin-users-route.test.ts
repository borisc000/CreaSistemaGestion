import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/server/api/response";

vi.mock("@/server/auth/request-context", () => ({
  getTenantContext: vi.fn()
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: {
    listUsers: vi.fn(),
    getUser: vi.fn(),
    setCustomUserClaims: vi.fn()
  }
}));

import { GET, PATCH } from "@/app/api/admin/users/route";
import { getTenantContext } from "@/server/auth/request-context";
import { adminAuth } from "@/lib/firebase/admin";

function mockUser(overrides: Record<string, unknown> = {}) {
  return {
    uid: "u-1",
    email: "admin@acme.com",
    displayName: "Admin",
    disabled: false,
    customClaims: {
      role: "admin",
      tenantId: "tenant-a"
    },
    metadata: {
      creationTime: "2026-03-01T00:00:00.000Z",
      lastSignInTime: "2026-03-06T00:00:00.000Z",
      lastRefreshTime: "2026-03-06T00:00:00.000Z",
      toJSON: () => ({})
    },
    emailVerified: true,
    phoneNumber: undefined,
    photoURL: undefined,
    passwordHash: undefined,
    passwordSalt: undefined,
    tenantId: null,
    providerData: [],
    toJSON: () => ({}),
    ...overrides
  };
}

describe("/api/admin/users route", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("allows admin to list users", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "admin",
      email: "owner@acme.com"
    });
    vi.mocked(adminAuth.listUsers).mockResolvedValue({
      users: [mockUser()],
      pageToken: "token-next"
    });

    const req = new NextRequest("http://localhost/api/admin/users?limit=25");
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].role).toBe("admin");
    expect(body.pageToken).toBe("token-next");
  });

  it("returns 403 when context rejects access", async () => {
    vi.mocked(getTenantContext).mockRejectedValue(new ApiError(403, "forbidden"));

    const req = new NextRequest("http://localhost/api/admin/users?limit=25");
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("forbidden");
  });

  it("updates user custom claims on PATCH", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "admin",
      email: "owner@acme.com"
    });
    vi.mocked(adminAuth.getUser).mockResolvedValue(
      mockUser({
        customClaims: {
          role: "viewer",
          tenantId: "tenant-a"
        }
      }) as never
    );
    vi.mocked(adminAuth.setCustomUserClaims).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        uid: "u-1",
        role: "hr",
        tenantId: "tenant-a"
      })
    });

    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(vi.mocked(adminAuth.setCustomUserClaims)).toHaveBeenCalledWith("u-1", expect.objectContaining({ role: "hr" }));
  });
});
