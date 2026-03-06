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

const integrationImportSetMock = vi.fn();
const integrationImportDocMock = {
  set: integrationImportSetMock
};
const integrationImportsCollectionMock = {
  doc: vi.fn(() => integrationImportDocMock),
  orderBy: vi.fn(),
  limit: vi.fn(),
  get: vi.fn()
};
const payrollCollectionMock = {
  doc: vi.fn(() => ({
    get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
    set: vi.fn().mockResolvedValue(undefined)
  }))
};

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn((name: string) => {
          if (name === "integrationImports") return integrationImportsCollectionMock;
          if (name === "personPayrollRecords") return payrollCollectionMock;
          return integrationImportsCollectionMock;
        })
      }))
    }))
  }
}));

import { POST } from "@/app/api/hr/imports/route";
import { getTenantContext } from "@/server/auth/request-context";
import { createEntity, listEntities } from "@/server/repositories/firestore-repository";
import { validateModuleRelations } from "@/server/validation/relations";

describe("/api/hr/imports route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns preview summary without mutating data", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "hr",
      email: "hr@acme.com"
    });

    const req = new NextRequest("http://localhost/api/hr/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "preview",
        source: "csv-manual",
        dataset: "people",
        delimiter: ";",
        content: "idNumber;fullName;position;contractId;hireDate;employmentStatus;sourceCandidateId\n12.345.678-5;Ana Perez;Analista;;2026-03-01;active;"
      })
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.summary.received).toBe(1);
    expect(body.data.summary.valid).toBe(1);
    expect(vi.mocked(createEntity)).not.toHaveBeenCalled();
  });

  it("commits people import and logs run", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "hr",
      email: "hr@acme.com"
    });
    vi.mocked(listEntities).mockResolvedValue([]);
    vi.mocked(validateModuleRelations).mockResolvedValue(undefined);
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

    const req = new NextRequest("http://localhost/api/hr/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "commit",
        source: "csv-manual",
        dataset: "people",
        delimiter: ";",
        content: "idNumber;fullName;position;contractId;hireDate;employmentStatus;sourceCandidateId\n12.345.678-5;Ana Perez;Analista;;2026-03-01;active;"
      })
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("ok");
    expect(body.data.summary.created).toBe(1);
    expect(vi.mocked(createEntity)).toHaveBeenCalledTimes(1);
    expect(integrationImportSetMock).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when role has no access", async () => {
    vi.mocked(getTenantContext).mockRejectedValue(new ApiError(403, "forbidden"));
    const req = new NextRequest("http://localhost/api/hr/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "preview",
        source: "csv-manual",
        dataset: "people",
        content: "idNumber;fullName;position;contractId;hireDate;employmentStatus;sourceCandidateId\n12.345.678-5;Ana Perez;Analista;;2026-03-01;active;"
      })
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("forbidden");
  });
});
