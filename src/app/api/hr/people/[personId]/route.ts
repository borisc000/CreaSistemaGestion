import { Timestamp } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { computeChangedFields, resolveAuditActor } from "@/server/domain/audit";
import {
  buildAccreditationMatrix,
  ensureDefaultAccreditationTemplates,
  isDateRangeActive
} from "@/server/domain/accreditation";
import { getEntity, listEntities } from "@/server/repositories/firestore-repository";
import type {
  AccreditationRequirementStatus,
  AccreditationTemplate,
  AuditLogEntry,
  Candidate,
  Contract,
  PersonContractAssignment,
  PersonDocument,
  PersonPayrollRecord,
  PersonRecord,
  Vacancy
} from "@/types/domain";

type RouteParams = {
  params: {
    personId: string;
  };
};

function toIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function serializeUnknown(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeUnknown(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, serializeUnknown(nested)])
    );
  }
  return value;
}

function normalizeTimelineEntry(id: string, raw: Record<string, unknown>): AuditLogEntry {
  const before = (serializeUnknown(raw.before) as Record<string, unknown> | null) || null;
  const after = (serializeUnknown(raw.after) as Record<string, unknown> | null) || null;
  const eventType =
    raw.eventType === "created" || raw.eventType === "updated" || raw.eventType === "deleted"
      ? raw.eventType
      : !before && after
        ? "created"
        : before && !after
          ? "deleted"
          : "updated";

  const changedFields = Array.isArray(raw.changedFields)
    ? raw.changedFields.filter((field): field is string => typeof field === "string").sort()
    : computeChangedFields(before, after);

  return {
    id,
    module: typeof raw.module === "string" ? raw.module : "unknown",
    collection: typeof raw.collection === "string" ? raw.collection : "unknown",
    entityId: typeof raw.entityId === "string" ? raw.entityId : id,
    eventType,
    createdAt: toIso(raw.createdAt),
    actor: resolveAuditActor(before, after),
    changedFields,
    before,
    after
  };
}

type RawPayrollRecord = {
  personId?: string;
  period?: string;
  grossIncome?: number;
  netIncome?: number;
  currency?: string;
  source?: string;
  items?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function normalizePayrollRecord(id: string, raw: RawPayrollRecord): PersonPayrollRecord {
  const items = Array.isArray(raw.items)
    ? raw.items
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const line = item as Record<string, unknown>;
          return {
            code: typeof line.code === "string" ? line.code : "N/A",
            label: typeof line.label === "string" ? line.label : "Sin etiqueta",
            amount: typeof line.amount === "number" ? line.amount : 0
          };
        })
    : [];

  return {
    id,
    personId: typeof raw.personId === "string" ? raw.personId : "",
    period: typeof raw.period === "string" ? raw.period : "N/A",
    grossIncome: typeof raw.grossIncome === "number" ? raw.grossIncome : 0,
    netIncome: typeof raw.netIncome === "number" ? raw.netIncome : 0,
    currency: typeof raw.currency === "string" ? raw.currency : "CLP",
    source: typeof raw.source === "string" ? raw.source : "manual",
    items,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt)
  };
}

function byRecentPeriod(left: PersonPayrollRecord, right: PersonPayrollRecord): number {
  if (left.period === right.period) {
    return right.createdAt.localeCompare(left.createdAt);
  }
  return right.period.localeCompare(left.period);
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const context = await getTenantContext(req, "hr_people", "read");
    const person = (await getEntity(context.tenantId, "peopleRecords", params.personId)) as PersonRecord | null;
    if (!person) {
      throw new ApiError(404, "Person not found.");
    }
    await ensureDefaultAccreditationTemplates(context.tenantId);

    const [documents, contracts, candidates, assignments, templates, payrollSnapshot, auditSnapshot] = await Promise.all([
      listEntities(context.tenantId, "personDocuments"),
      listEntities(context.tenantId, "contracts"),
      listEntities(context.tenantId, "candidates"),
      listEntities(context.tenantId, "personContractAssignments"),
      listEntities(context.tenantId, "accreditationTemplates"),
      adminDb
        .collection("tenants")
        .doc(context.tenantId)
        .collection("personPayrollRecords")
        .where("personId", "==", person.id)
        .limit(80)
        .get(),
      adminDb
        .collection("tenants")
        .doc(context.tenantId)
        .collection("auditLogs")
        .orderBy("createdAt", "desc")
        .limit(200)
        .get()
    ]);

    const personDocuments = documents
      .filter((document) => document.personId === person.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)) as PersonDocument[];
    const personAssignments = assignments.filter((assignment) => assignment.personId === person.id) as PersonContractAssignment[];
    const activeAssignments = personAssignments
      .filter((assignment) => assignment.status === "active" && isDateRangeActive(assignment, new Date()))
      .sort((left, right) => right.startDate.localeCompare(left.startDate));
    const accreditationTemplates = templates as AccreditationTemplate[];

    const contract = (contracts.find((entry) => entry.id === person.contractId) || null) as Contract | null;
    const contractById = new Map(contracts.map((entry) => [entry.id, entry as Contract]));
    const accreditationContractIds = new Set<string>();
    if (person.contractId) {
      accreditationContractIds.add(person.contractId);
    }
    for (const assignment of activeAssignments) {
      accreditationContractIds.add(assignment.contractId);
    }
    const accreditationIndicators = Array.from(accreditationContractIds)
      .map((contractId) => contractById.get(contractId))
      .filter((entry): entry is Contract => Boolean(entry))
      .map((entry) => {
        const requirements = buildAccreditationMatrix({
          contract: entry,
          templates: accreditationTemplates,
          documents: personDocuments,
          asOf: new Date()
        });
        const summary = requirements.reduce(
          (acc, requirement) => {
            acc.total += 1;
            acc[requirement.status] += 1;
            return acc;
          },
          {
            total: 0,
            pending: 0,
            expired: 0,
            compliant: 0,
            reused: 0
          } as Record<AccreditationRequirementStatus | "total", number>
        );
        return {
          contractId: entry.id,
          contractName: entry.name,
          summary
        };
      });

    const sourceCandidate =
      ((person.sourceCandidateId
        ? candidates.find((candidate) => candidate.id === person.sourceCandidateId)
        : candidates.find((candidate) => candidate.personRecordId === person.id)) || null) as Candidate | null;

    const sourceVacancy = sourceCandidate
      ? ((await getEntity(context.tenantId, "vacancies", sourceCandidate.vacancyId)) as Vacancy | null)
      : null;

    const payrollRecords = payrollSnapshot.docs
      .map((doc) => normalizePayrollRecord(doc.id, doc.data() as RawPayrollRecord))
      .sort(byRecentPeriod);

    const payrollTotals = payrollRecords.reduce(
      (acc, record) => {
        acc.gross += record.grossIncome;
        acc.net += record.netIncome;
        return acc;
      },
      { gross: 0, net: 0 }
    );

    const timeline = auditSnapshot.docs
      .map((doc) => normalizeTimelineEntry(doc.id, doc.data() as Record<string, unknown>))
      .filter((entry) => {
        if (entry.collection === "peopleRecords" && entry.entityId === person.id) return true;
        if (entry.collection === "personDocuments" || entry.collection === "personContractAssignments") {
          const beforePersonId = typeof entry.before?.personId === "string" ? entry.before.personId : null;
          const afterPersonId = typeof entry.after?.personId === "string" ? entry.after.personId : null;
          return beforePersonId === person.id || afterPersonId === person.id;
        }
        return false;
      })
      .slice(0, 80);

    return jsonOk({
      data: {
        person,
        contract,
        sourceCandidate,
        sourceVacancy,
        documents: personDocuments,
        payroll: {
          records: payrollRecords,
          summary: {
            periods: payrollRecords.length,
            grossTotal: payrollTotals.gross,
            netTotal: payrollTotals.net
          },
          placeholders: [
            "Pendiente: cierre mensual de remuneraciones por centro de costo.",
            "Pendiente: aprobacion de novedades (horas extra, descuentos, bonos).",
            "Pendiente: conciliacion con proveedor de nomina externo."
          ]
        },
        accreditation: {
          activeAssignments,
          indicators: accreditationIndicators
        },
        timeline
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
