import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/server/api/response";

vi.mock("@/server/auth/request-context", () => ({
  getTenantContext: vi.fn()
}));

const queryMock = {
  startAfter: vi.fn(),
  limit: vi.fn(),
  get: vi.fn()
};

const auditCollectionMock = {
  orderBy: vi.fn(),
  doc: vi.fn()
};

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => auditCollectionMock)
      }))
    }))
  }
}));

import { GET } from "@/app/api/audit/route";
import { getTenantContext } from "@/server/auth/request-context";

describe("/api/audit route", () => {
  beforeEach(() => {
    queryMock.startAfter.mockReturnValue(queryMock);
    queryMock.limit.mockReturnValue(queryMock);
    queryMock.get.mockResolvedValue({
      empty: false,
      size: 1,
      docs: [
        {
          id: "audit-1",
          data: () => ({
            module: "contracts",
            collection: "contracts",
            entityId: "contract-1",
            eventType: "updated",
            createdAt: "2026-03-06T00:00:00.000Z",
            actor: {
              uid: "admin-1",
              email: "admin@acme.com",
              role: "tenant_admin",
              source: "user"
            },
            before: { status: "draft" },
            after: { status: "active" },
            changedFields: ["status"]
          })
        }
      ]
    });
    auditCollectionMock.orderBy.mockReturnValue(queryMock);
    auditCollectionMock.doc.mockReturnValue({
      get: vi.fn().mockResolvedValue({ exists: false })
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("returns audit events for tenant admin", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "tenant_admin",
      email: "owner@acme.com"
    });

    const req = new NextRequest("http://localhost/api/audit?limit=10");
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].module).toBe("contracts");
    expect(body.data[0].changedFields).toEqual(["status"]);
  });

  it("returns 403 when role has no access", async () => {
    vi.mocked(getTenantContext).mockRejectedValue(new ApiError(403, "forbidden"));

    const req = new NextRequest("http://localhost/api/audit?limit=10");
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("forbidden");
  });
});
