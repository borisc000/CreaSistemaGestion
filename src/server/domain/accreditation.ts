import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/server/api/response";
import type {
  AccreditationRequirementResult,
  AccreditationScope,
  AccreditationTemplate,
  Contract,
  PersonContractAssignment,
  PersonDocument
} from "@/types/domain";

type DefaultTemplateDraft = Omit<AccreditationTemplate, "id" | "createdAt" | "updatedAt">;

export const DEFAULT_ACCREDITATION_TEMPLATES: DefaultTemplateDraft[] = [
  {
    code: "CARNET",
    name: "Carnet",
    scope: "global",
    clientName: null,
    contractId: null,
    required: true,
    validityDays: null,
    enabled: true,
    sortOrder: 10
  },
  {
    code: "DOC_1",
    name: "DOC 1",
    scope: "global",
    clientName: null,
    contractId: null,
    required: true,
    validityDays: null,
    enabled: true,
    sortOrder: 20
  },
  {
    code: "DOC_2",
    name: "DOC 2",
    scope: "client",
    clientName: "Puerto Mejillones",
    contractId: null,
    required: true,
    validityDays: 365,
    enabled: true,
    sortOrder: 30
  },
  {
    code: "MATRIZ_RIESGO",
    name: "Matriz de Riesgo",
    scope: "client",
    clientName: "Puerto Mejillones",
    contractId: null,
    required: true,
    validityDays: 365,
    enabled: true,
    sortOrder: 40
  },
  {
    code: "FIRMA",
    name: "Firma",
    scope: "client",
    clientName: "Puerto Mejillones",
    contractId: null,
    required: true,
    validityDays: 180,
    enabled: true,
    sortOrder: 50
  }
];

function normalizeText(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function encodeChunk(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) return "all";
  return normalized.replace(/[^a-z0-9]+/g, "_");
}

export function buildTemplateSeedId(template: DefaultTemplateDraft): string {
  return [
    "seed",
    template.scope,
    encodeChunk(template.code),
    encodeChunk(template.clientName),
    encodeChunk(template.contractId)
  ].join("__");
}

export async function ensureDefaultAccreditationTemplates(tenantId: string): Promise<void> {
  const now = new Date().toISOString();
  const collectionRef = adminDb.collection("tenants").doc(tenantId).collection("accreditationTemplates");

  await Promise.all(
    DEFAULT_ACCREDITATION_TEMPLATES.map(async (template) => {
      const id = buildTemplateSeedId(template);
      const docRef = collectionRef.doc(id);
      const doc = await docRef.get();
      if (doc.exists) return;

      await docRef.set({
        ...template,
        createdAt: now,
        updatedAt: now
      });
    })
  );
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function isDateRangeActive(
  range: { startDate: string; endDate: string | null },
  asOf: Date
): boolean {
  const start = parseDate(range.startDate);
  if (!start) return false;
  const end = parseDate(range.endDate);
  if (start.getTime() > asOf.getTime()) return false;
  if (end && end.getTime() < asOf.getTime()) return false;
  return true;
}

function scopePriority(scope: AccreditationScope | null | undefined): number {
  if (scope === "contract") return 3;
  if (scope === "client") return 2;
  return 1;
}

export function templateAppliesToContract(template: AccreditationTemplate, contract: Contract): boolean {
  if (!template.enabled) return false;
  if (template.scope === "global") return true;
  if (template.scope === "client") {
    return normalizeText(template.clientName) === normalizeText(contract.client);
  }
  return template.contractId === contract.id;
}

function documentMatchesTemplate(document: PersonDocument, template: AccreditationTemplate): boolean {
  const templateCode = normalizeText(template.code);
  const templateName = normalizeText(template.name);
  const docTemplateCode = normalizeText(document.templateCode);
  const docType = normalizeText(document.docType);

  if (docTemplateCode && docTemplateCode === templateCode) return true;
  if (docType === templateCode || docType === templateName) return true;
  return false;
}

function documentCoversRequirementForContract(
  document: PersonDocument,
  template: AccreditationTemplate,
  contract: Contract
): boolean {
  const documentScope = document.scope || "global";

  if (template.scope === "contract") {
    return documentScope === "contract" && document.contractId === contract.id;
  }

  if (template.scope === "client") {
    if (documentScope === "contract") {
      return document.contractId === contract.id;
    }
    if (documentScope === "client") {
      return normalizeText(document.clientName) === normalizeText(contract.client);
    }
    return true;
  }

  if (documentScope === "contract") {
    return document.contractId === contract.id;
  }
  if (documentScope === "client") {
    return normalizeText(document.clientName) === normalizeText(contract.client);
  }
  return true;
}

function isDocumentExpired(document: PersonDocument, asOf: Date): boolean {
  const expiry = parseDate(document.expiryDate);
  if (!expiry) return false;
  return expiry.getTime() < asOf.getTime();
}

function sortTemplates(left: AccreditationTemplate, right: AccreditationTemplate): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }
  return left.name.localeCompare(right.name);
}

type MatrixInput = {
  contract: Contract;
  templates: AccreditationTemplate[];
  documents: PersonDocument[];
  asOf: Date;
};

export function buildAccreditationMatrix({
  contract,
  templates,
  documents,
  asOf
}: MatrixInput): AccreditationRequirementResult[] {
  const applicableTemplates = templates.filter((template) => templateAppliesToContract(template, contract)).sort(sortTemplates);

  return applicableTemplates.map((template) => {
    const candidateDocuments = documents
      .filter((document) => documentMatchesTemplate(document, template))
      .filter((document) => documentCoversRequirementForContract(document, template, contract))
      .sort((left, right) => {
        const leftPriority = scopePriority(left.scope);
        const rightPriority = scopePriority(right.scope);
        if (leftPriority !== rightPriority) return rightPriority - leftPriority;
        return right.updatedAt.localeCompare(left.updatedAt);
      });

    const evidence = candidateDocuments[0] || null;
    if (!evidence) {
      return {
        template,
        status: "pending",
        evidenceDocumentId: null,
        evidenceFileName: null,
        evidenceScope: null,
        evidenceExpiryDate: null
      };
    }

    if (isDocumentExpired(evidence, asOf)) {
      return {
        template,
        status: "expired",
        evidenceDocumentId: evidence.id,
        evidenceFileName: evidence.fileName,
        evidenceScope: evidence.scope || "global",
        evidenceExpiryDate: evidence.expiryDate || null
      };
    }

    const evidenceScope = evidence.scope || "global";
    const reused = scopePriority(evidenceScope) < scopePriority(template.scope);

    return {
      template,
      status: reused ? "reused" : "compliant",
      evidenceDocumentId: evidence.id,
      evidenceFileName: evidence.fileName,
      evidenceScope,
      evidenceExpiryDate: evidence.expiryDate || null
    };
  });
}

export function assertNoOverlappingActiveAssignments(
  assignments: PersonContractAssignment[],
  candidate: {
    id?: string;
    personId: string;
    contractId: string;
    startDate: string;
    endDate: string | null;
    status: "active" | "inactive";
  }
): void {
  if (candidate.status !== "active") return;

  const candidateStart = parseDate(candidate.startDate);
  if (!candidateStart) {
    throw new ApiError(400, "startDate is invalid.");
  }
  const candidateEnd = parseDate(candidate.endDate);
  if (candidateEnd && candidateEnd.getTime() < candidateStart.getTime()) {
    throw new ApiError(400, "endDate cannot be before startDate.");
  }

  for (const assignment of assignments) {
    if (candidate.id && assignment.id === candidate.id) continue;
    if (assignment.personId !== candidate.personId || assignment.contractId !== candidate.contractId) continue;
    if (assignment.status !== "active") continue;

    const currentStart = parseDate(assignment.startDate);
    if (!currentStart) continue;
    const currentEnd = parseDate(assignment.endDate);
    if (currentEnd && currentEnd.getTime() < currentStart.getTime()) continue;

    const startsBeforeCurrentEnds = !currentEnd || candidateStart.getTime() <= currentEnd.getTime();
    const currentStartsBeforeCandidateEnds = !candidateEnd || currentStart.getTime() <= candidateEnd.getTime();
    if (startsBeforeCurrentEnds && currentStartsBeforeCandidateEnds) {
      throw new ApiError(409, "An active assignment already exists with an overlapping date range.");
    }
  }
}
