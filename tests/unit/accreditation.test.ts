import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/server/api/response";
import {
  assertNoOverlappingActiveAssignments,
  buildAccreditationMatrix,
  templateAppliesToContract
} from "../../src/server/domain/accreditation";
import type { AccreditationTemplate, Contract, PersonContractAssignment, PersonDocument } from "../../src/types/domain";

function buildContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: "contract-1",
    tenderId: null,
    name: "Contrato 1",
    client: "Puerto Mejillones",
    totalValue: 1000,
    costEstimate: 500,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    manager: "Manager",
    status: "active",
    progress: 20,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function buildTemplate(overrides: Partial<AccreditationTemplate> = {}): AccreditationTemplate {
  return {
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function buildDocument(overrides: Partial<PersonDocument> = {}): PersonDocument {
  return {
    id: "doc-1",
    personId: "person-1",
    docType: "Carnet",
    fileName: "carnet.pdf",
    filePath: "tenants/t-1/carnet.pdf",
    templateCode: "CARNET",
    scope: "global",
    clientName: null,
    contractId: null,
    validFrom: null,
    reusable: true,
    status: "uploaded",
    expiryDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides
  };
}

function buildAssignment(overrides: Partial<PersonContractAssignment> = {}): PersonContractAssignment {
  return {
    id: "asg-1",
    personId: "person-1",
    contractId: "contract-1",
    startDate: "2026-01-01",
    endDate: null,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("accreditation domain", () => {
  it("applies templates by scope", () => {
    const contract = buildContract();
    expect(templateAppliesToContract(buildTemplate({ scope: "global" }), contract)).toBe(true);
    expect(
      templateAppliesToContract(buildTemplate({ scope: "client", clientName: "Puerto Mejillones" }), contract)
    ).toBe(true);
    expect(
      templateAppliesToContract(buildTemplate({ scope: "contract", contractId: contract.id }), contract)
    ).toBe(true);
    expect(
      templateAppliesToContract(buildTemplate({ scope: "client", clientName: "Cliente X" }), contract)
    ).toBe(false);
  });

  it("prioritizes contract evidence over client/global and marks compliant", () => {
    const contract = buildContract();
    const template = buildTemplate({
      id: "tpl-firma",
      code: "FIRMA",
      name: "Firma",
      scope: "contract",
      contractId: contract.id
    });

    const matrix = buildAccreditationMatrix({
      contract,
      templates: [template],
      documents: [
        buildDocument({
          id: "doc-global",
          templateCode: "FIRMA",
          docType: "Firma",
          scope: "global",
          updatedAt: "2026-03-01T00:00:00.000Z"
        }),
        buildDocument({
          id: "doc-contract",
          templateCode: "FIRMA",
          docType: "Firma",
          scope: "contract",
          contractId: contract.id,
          updatedAt: "2026-03-02T00:00:00.000Z"
        })
      ],
      asOf: new Date("2026-03-10T00:00:00.000Z")
    });

    expect(matrix[0].status).toBe("compliant");
    expect(matrix[0].evidenceDocumentId).toBe("doc-contract");
  });

  it("marks reused when client requirement is covered by global evidence", () => {
    const contract = buildContract();
    const template = buildTemplate({
      id: "tpl-risk",
      code: "MATRIZ_RIESGO",
      name: "Matriz de Riesgo",
      scope: "client",
      clientName: "Puerto Mejillones"
    });

    const matrix = buildAccreditationMatrix({
      contract,
      templates: [template],
      documents: [
        buildDocument({
          id: "doc-risk",
          templateCode: "MATRIZ_RIESGO",
          docType: "Matriz de Riesgo",
          scope: "global"
        })
      ],
      asOf: new Date("2026-03-10T00:00:00.000Z")
    });

    expect(matrix[0].status).toBe("reused");
  });

  it("treats null expiryDate as non-expired by default", () => {
    const contract = buildContract();
    const template = buildTemplate();
    const matrix = buildAccreditationMatrix({
      contract,
      templates: [template],
      documents: [buildDocument({ expiryDate: null })],
      asOf: new Date("2026-03-10T00:00:00.000Z")
    });
    expect(matrix[0].status).toBe("compliant");
  });

  it("marks requirement as expired when selected evidence is past expiryDate", () => {
    const contract = buildContract();
    const template = buildTemplate();
    const matrix = buildAccreditationMatrix({
      contract,
      templates: [template],
      documents: [
        buildDocument({
          expiryDate: "2026-03-01"
        })
      ],
      asOf: new Date("2026-03-10T00:00:00.000Z")
    });
    expect(matrix[0].status).toBe("expired");
  });

  it("rejects overlapping active assignments for the same person and contract", () => {
    expect(() =>
      assertNoOverlappingActiveAssignments(
        [
          buildAssignment({
            id: "asg-existing",
            startDate: "2026-01-01",
            endDate: "2026-03-20"
          })
        ],
        {
          personId: "person-1",
          contractId: "contract-1",
          startDate: "2026-03-10",
          endDate: null,
          status: "active"
        }
      )
    ).toThrow(ApiError);
  });

  it("rejects invalid ranges where endDate is before startDate", () => {
    expect(() =>
      assertNoOverlappingActiveAssignments([], {
        personId: "person-1",
        contractId: "contract-1",
        startDate: "2026-03-20",
        endDate: "2026-03-10",
        status: "active"
      })
    ).toThrow(ApiError);
  });
});
