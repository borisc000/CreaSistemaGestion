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

vi.mock("@/server/domain/accreditation", () => ({
  assertNoOverlappingActiveAssignments: vi.fn(),
  ensureDefaultAccreditationTemplates: vi.fn(),
  buildAccreditationMatrix: vi.fn(),
  isDateRangeActive: vi.fn(() => true)
}));

import { GET as assignmentsGet, POST as assignmentsPost } from "@/app/api/hr/accreditation/assignments/route";
import { GET as templatesGet } from "@/app/api/hr/accreditation/templates/route";
import { GET as matrixGet } from "@/app/api/hr/accreditation/matrix/route";
import { POST as documentsPost } from "@/app/api/hr/documents/route";
import { getTenantContext } from "@/server/auth/request-context";
import {
  buildAccreditationMatrix,
  ensureDefaultAccreditationTemplates
} from "@/server/domain/accreditation";
import {
  createEntity,
  getEntity,
  listEntities
} from "@/server/repositories/firestore-repository";
import { validateModuleRelations } from "@/server/validation/relations";

describe("hr accreditation APIs", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("creates person-contract assignment", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "hr",
      email: "hr@acme.com"
    });
    vi.mocked(validateModuleRelations).mockResolvedValue(undefined);
    vi.mocked(listEntities).mockResolvedValue([]);
    vi.mocked(createEntity).mockResolvedValue({
      id: "asg-1",
      personId: "person-1",
      contractId: "contract-1",
      startDate: "2026-03-01",
      endDate: null,
      status: "active",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z"
    } as never);

    const req = new NextRequest("http://localhost/api/hr/accreditation/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personId: "person-1",
        contractId: "contract-1",
        startDate: "2026-03-01"
      })
    });

    const response = await assignmentsPost(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.id).toBe("asg-1");
    expect(vi.mocked(createEntity)).toHaveBeenCalledWith(
      "tenant-a",
      "personContractAssignments",
      expect.objectContaining({
        personId: "person-1",
        contractId: "contract-1",
        status: "active"
      }),
      expect.any(Object)
    );
  });

  it("filters templates and excludes disabled by default", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "hr",
      email: "hr@acme.com"
    });
    vi.mocked(ensureDefaultAccreditationTemplates).mockResolvedValue(undefined);
    vi.mocked(listEntities).mockResolvedValue([
      {
        id: "tpl-1",
        code: "CARNET",
        name: "Carnet",
        scope: "global",
        clientName: null,
        contractId: null,
        required: true,
        validityDays: null,
        enabled: true,
        sortOrder: 10,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z"
      },
      {
        id: "tpl-2",
        code: "DOC_2",
        name: "DOC 2",
        scope: "client",
        clientName: "Puerto Mejillones",
        contractId: null,
        required: true,
        validityDays: 365,
        enabled: false,
        sortOrder: 20,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z"
      }
    ] as never);

    const req = new NextRequest("http://localhost/api/hr/accreditation/templates");
    const response = await templatesGet(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].code).toBe("CARNET");
  });

  it("builds accreditation matrix summary", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "hr",
      email: "hr@acme.com"
    });
    vi.mocked(ensureDefaultAccreditationTemplates).mockResolvedValue(undefined);
    vi.mocked(getEntity)
      .mockResolvedValueOnce({
        id: "person-1",
        fullName: "Ana",
        idNumber: "12345678-5",
        position: "Analista",
        contractId: "contract-1",
        hireDate: "2026-01-01",
        employmentStatus: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      } as never)
      .mockResolvedValueOnce({
        id: "contract-1",
        tenderId: null,
        name: "Contrato A",
        client: "Puerto Mejillones",
        totalValue: 1,
        costEstimate: 1,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        manager: "M",
        status: "active",
        progress: 10,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      } as never);

    vi.mocked(listEntities)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    vi.mocked(buildAccreditationMatrix).mockReturnValue([
      {
        template: {
          id: "tpl-1",
          code: "CARNET",
          name: "Carnet",
          scope: "global",
          clientName: null,
          contractId: null,
          required: true,
          validityDays: null,
          enabled: true,
          sortOrder: 10,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z"
        },
        status: "pending",
        evidenceDocumentId: null,
        evidenceFileName: null,
        evidenceScope: null,
        evidenceExpiryDate: null
      },
      {
        template: {
          id: "tpl-2",
          code: "DOC_2",
          name: "DOC 2",
          scope: "client",
          clientName: "Puerto Mejillones",
          contractId: null,
          required: true,
          validityDays: 365,
          enabled: true,
          sortOrder: 20,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z"
        },
        status: "compliant",
        evidenceDocumentId: "doc-1",
        evidenceFileName: "doc.pdf",
        evidenceScope: "client",
        evidenceExpiryDate: "2026-12-31"
      }
    ] as never);

    const req = new NextRequest("http://localhost/api/hr/accreditation/matrix?personId=person-1&contractId=contract-1");
    const response = await matrixGet(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.summary.total).toBe(2);
    expect(body.data.summary.pending).toBe(1);
    expect(body.data.summary.compliant).toBe(1);
  });

  it("returns 403 for unauthorized assignment read", async () => {
    vi.mocked(getTenantContext).mockRejectedValue(new ApiError(403, "forbidden"));
    const req = new NextRequest("http://localhost/api/hr/accreditation/assignments");
    const response = await assignmentsGet(req);
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toContain("forbidden");
  });

  it("persists accreditation metadata in /api/hr/documents", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "hr",
      email: "hr@acme.com"
    });
    vi.mocked(validateModuleRelations).mockResolvedValue(undefined);
    vi.mocked(createEntity).mockResolvedValue({
      id: "doc-1",
      personId: "person-1",
      docType: "DOC 1",
      fileName: "doc1.pdf",
      filePath: "tenants/tenant-a/people/person-1/documents/doc1.pdf",
      templateCode: "DOC_1",
      scope: "contract",
      contractId: "contract-1",
      clientName: null,
      validFrom: "2026-03-01",
      reusable: true,
      status: "uploaded",
      expiryDate: "2026-12-31",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z"
    } as never);

    const req = new NextRequest("http://localhost/api/hr/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personId: "person-1",
        docType: "DOC 1",
        fileName: "doc1.pdf",
        filePath: "tenants/tenant-a/people/person-1/documents/doc1.pdf",
        templateCode: "DOC_1",
        scope: "contract",
        contractId: "contract-1",
        validFrom: "2026-03-01",
        reusable: true,
        expiryDate: "2026-12-31"
      })
    });

    const response = await documentsPost(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.templateCode).toBe("DOC_1");
    expect(vi.mocked(createEntity)).toHaveBeenCalledWith(
      "tenant-a",
      "personDocuments",
      expect.objectContaining({
        templateCode: "DOC_1",
        scope: "contract",
        contractId: "contract-1"
      }),
      expect.any(Object)
    );
  });
});
