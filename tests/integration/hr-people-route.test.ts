import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/server/api/response";

vi.mock("@/server/auth/request-context", () => ({
  getTenantContext: vi.fn()
}));

vi.mock("@/server/repositories/firestore-repository", () => ({
  listEntities: vi.fn(),
  createEntity: vi.fn(),
  getEntity: vi.fn(),
  patchEntity: vi.fn()
}));

vi.mock("@/server/validation/relations", () => ({
  validateModuleRelations: vi.fn()
}));

import { GET, POST } from "@/app/api/hr/people/route";
import { getTenantContext } from "@/server/auth/request-context";
import { createEntity, listEntities } from "@/server/repositories/firestore-repository";
import { validateModuleRelations } from "@/server/validation/relations";

describe("/api/hr/people route", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("creates a person and stores normalized rut", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "hr",
      email: "hr@acme.com"
    });
    vi.mocked(validateModuleRelations).mockResolvedValue(undefined);
    vi.mocked(listEntities).mockResolvedValue([]);
    vi.mocked(createEntity).mockResolvedValue({
      id: "person-1",
      fullName: "Ana Perez",
      idNumber: "12345678-5",
      rutNormalized: "12345678-5",
      position: "Analista",
      contractId: null,
      hireDate: "2026-03-01",
      employmentStatus: "active",
      sourceCandidateId: null,
      createdAt: "2026-03-06T00:00:00.000Z",
      updatedAt: "2026-03-06T00:00:00.000Z"
    } as never);

    const req = new NextRequest("http://localhost/api/hr/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Ana Perez",
        idNumber: "12.345.678-5",
        position: "Analista",
        contractId: null,
        hireDate: "2026-03-01",
        employmentStatus: "active"
      })
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.rutNormalized).toBe("12345678-5");
    expect(vi.mocked(createEntity)).toHaveBeenCalledWith(
      "tenant-a",
      "peopleRecords",
      expect.objectContaining({
        idNumber: "12345678-5",
        rutNormalized: "12345678-5"
      }),
      expect.any(Object)
    );
  });

  it("returns 409 when another person has the same rut in tenant", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "hr",
      email: "hr@acme.com"
    });
    vi.mocked(validateModuleRelations).mockResolvedValue(undefined);
    vi.mocked(listEntities).mockResolvedValue([
      {
        id: "person-existing",
        fullName: "Persona Existente",
        idNumber: "12345678-5",
        rutNormalized: "12345678-5",
        position: "Analista",
        contractId: null,
        hireDate: "2026-03-01",
        employmentStatus: "active",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z"
      }
    ] as never);

    const req = new NextRequest("http://localhost/api/hr/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Ana Perez",
        idNumber: "12.345.678-5",
        position: "Analista",
        contractId: null,
        hireDate: "2026-03-01",
        employmentStatus: "active"
      })
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("RUT");
  });

  it("returns 403 when role has no access", async () => {
    vi.mocked(getTenantContext).mockRejectedValue(new ApiError(403, "forbidden"));
    const req = new NextRequest("http://localhost/api/hr/people");
    const response = await GET(req);
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toContain("forbidden");
  });
});
