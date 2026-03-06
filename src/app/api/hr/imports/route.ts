import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { buildImportPreview, type CanonicalPayrollRow, type CanonicalPeopleRow } from "@/server/domain/integration-import";
import { isPendingIdNumber, normalizeRut, tryNormalizeRut } from "@/server/domain/rut";
import {
  createEntity,
  getEntity,
  listEntities,
  patchEntity
} from "@/server/repositories/firestore-repository";
import { validateModuleRelations } from "@/server/validation/relations";
import type { IntegrationImportError, IntegrationRunStatus, PersonRecord, Vacancy } from "@/types/domain";

const importRequestSchema = z.object({
  mode: z.enum(["preview", "commit"]),
  source: z.string().min(2).max(60),
  dataset: z.enum(["people", "payroll"]),
  delimiter: z.enum([",", ";"]).optional(),
  content: z.string().min(1)
});

function toIso(value: unknown): string {
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function normalizeImportedIdNumber(idNumber: string): { idNumber: string; rutNormalized: string | null } {
  const trimmed = idNumber.trim();
  if (!trimmed) {
    throw new ApiError(400, "idNumber is required.");
  }

  if (isPendingIdNumber(trimmed)) {
    return {
      idNumber: trimmed.toUpperCase(),
      rutNormalized: null
    };
  }

  const rutNormalized = normalizeRut(trimmed);
  return {
    idNumber: rutNormalized,
    rutNormalized
  };
}

async function resolveContractFromSourceCandidate(
  tenantId: string,
  sourceCandidateId: string | null,
  contractId: string | null
): Promise<string | null> {
  if (!sourceCandidateId) return contractId;

  const candidate = await getEntity(tenantId, "candidates", sourceCandidateId);
  if (!candidate) {
    throw new ApiError(400, "sourceCandidateId does not exist.");
  }

  const candidateData = candidate as { stage?: string; vacancyId?: string | null };
  if (candidateData.stage !== "hired") {
    throw new ApiError(409, "sourceCandidateId must reference a hired candidate.");
  }

  if (!candidateData.vacancyId) {
    return contractId;
  }

  const vacancy = (await getEntity(tenantId, "vacancies", candidateData.vacancyId)) as Vacancy | null;
  if (!vacancy) {
    throw new ApiError(400, "Source candidate vacancy does not exist.");
  }

  if (contractId && vacancy.contractId && contractId !== vacancy.contractId) {
    throw new ApiError(409, "contractId does not match source candidate contract.");
  }

  return contractId || vacancy.contractId || null;
}

async function logImportRun(
  tenantId: string,
  payload: {
    source: string;
    dataset: "people" | "payroll";
    mode: "preview" | "commit";
    status: IntegrationRunStatus;
    actor: { uid: string; email: string | null; role: string };
    totals: { received: number; valid: number; committed: number; created: number; updated: number; errors: number };
    errors: IntegrationImportError[];
  }
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("integrationImports")
    .doc(id)
    .set({
      ...payload,
      actor: {
        uid: payload.actor.uid,
        email: payload.actor.email,
        role: payload.actor.role,
        source: "user"
      },
      createdAt: now,
      updatedAt: now
    });

  return id;
}

async function commitPeopleImport(
  tenantId: string,
  rows: CanonicalPeopleRow[],
  actor: { uid: string; email: string | null; role: "admin" | "tender_lead" | "contract_manager" | "finance" | "hr" | "viewer" }
): Promise<{ committed: number; created: number; updated: number; errors: IntegrationImportError[] }> {
  const errors: IntegrationImportError[] = [];
  let committed = 0;
  let created = 0;
  let updated = 0;

  const people = (await listEntities(tenantId, "peopleRecords")) as PersonRecord[];
  const byId = new Map(people.map((person) => [person.id, person]));
  const byRut = new Map<string, PersonRecord>();
  for (const person of people) {
    const normalized = person.rutNormalized || tryNormalizeRut(person.idNumber);
    if (normalized) {
      byRut.set(normalized, person);
    }
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    try {
      const normalizedId = normalizeImportedIdNumber(row.idNumber);
      const normalizedContractId = await resolveContractFromSourceCandidate(
        tenantId,
        row.sourceCandidateId,
        row.contractId
      );

      const payload = {
        ...row,
        idNumber: normalizedId.idNumber,
        rutNormalized: normalizedId.rutNormalized,
        contractId: normalizedContractId,
        sourceCandidateId: row.sourceCandidateId ?? null
      };

      const existingPerson =
        (payload.rutNormalized ? byRut.get(payload.rutNormalized) : null) ||
        (row.sourceCandidateId ? people.find((person) => person.sourceCandidateId === row.sourceCandidateId) : null) ||
        null;

      if (existingPerson) {
        await validateModuleRelations({
          tenantId,
          moduleKey: "hr_people",
          relationSet: "peopleRecords",
          payload,
          mode: "patch"
        });

        await patchEntity(
          tenantId,
          "peopleRecords",
          existingPerson.id,
          {
            fullName: payload.fullName,
            idNumber: payload.idNumber,
            rutNormalized: payload.rutNormalized,
            position: payload.position,
            contractId: payload.contractId,
            hireDate: payload.hireDate,
            employmentStatus: payload.employmentStatus,
            sourceCandidateId: payload.sourceCandidateId
          },
          actor
        );
        updated += 1;
        committed += 1;
        continue;
      }

      await validateModuleRelations({
        tenantId,
        moduleKey: "hr_people",
        relationSet: "peopleRecords",
        payload,
        mode: "create"
      });

      const createdPerson = await createEntity(
        tenantId,
        "peopleRecords",
        {
          fullName: payload.fullName,
          idNumber: payload.idNumber,
          rutNormalized: payload.rutNormalized,
          position: payload.position,
          contractId: payload.contractId,
          hireDate: payload.hireDate,
          employmentStatus: payload.employmentStatus,
          sourceCandidateId: payload.sourceCandidateId
        } as never,
        actor
      );

      const createdPersonRecord = createdPerson as PersonRecord;
      created += 1;
      committed += 1;
      byId.set(createdPersonRecord.id, createdPersonRecord);
      if (createdPersonRecord.rutNormalized) {
        byRut.set(createdPersonRecord.rutNormalized, createdPersonRecord);
      }
    } catch (error) {
      errors.push({
        row: index + 2,
        code: "people_commit_error",
        message: error instanceof Error ? error.message : "Could not import person row."
      });
    }
  }

  return {
    committed,
    created,
    updated,
    errors
  };
}

async function commitPayrollImport(
  tenantId: string,
  source: string,
  rows: CanonicalPayrollRow[],
  actor: { uid: string; email: string | null; role: "admin" | "tender_lead" | "contract_manager" | "finance" | "hr" | "viewer" }
): Promise<{ committed: number; created: number; updated: number; errors: IntegrationImportError[] }> {
  const errors: IntegrationImportError[] = [];
  let committed = 0;
  let created = 0;
  let updated = 0;
  const now = new Date().toISOString();
  const sourceKey = slugify(source || "external");

  const people = (await listEntities(tenantId, "peopleRecords")) as PersonRecord[];
  const byPersonId = new Map(people.map((person) => [person.id, person]));
  const byRut = new Map<string, PersonRecord>();
  for (const person of people) {
    const normalized = person.rutNormalized || tryNormalizeRut(person.idNumber);
    if (normalized) {
      byRut.set(normalized, person);
    }
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    try {
      const personById = byPersonId.get(row.personRef) || null;
      const normalizedRef = tryNormalizeRut(row.personRef);
      const person = personById || (normalizedRef ? byRut.get(normalizedRef) || null : null);
      if (!person) {
        throw new ApiError(404, "Person reference not found for payroll row.");
      }

      const periodKey = row.period.replace(/[^0-9-]/g, "");
      const docId = `${person.id}__${periodKey}__${sourceKey}`;
      const docRef = adminDb
        .collection("tenants")
        .doc(tenantId)
        .collection("personPayrollRecords")
        .doc(docId);

      const currentDoc = await docRef.get();
      await docRef.set(
        {
          personId: person.id,
          period: row.period,
          grossIncome: row.grossIncome,
          netIncome: row.netIncome,
          currency: row.currency,
          source,
          items: row.items,
          importedByUid: actor.uid,
          importedByEmail: actor.email,
          createdAt: currentDoc.exists ? toIso(currentDoc.data()?.createdAt) : now,
          updatedAt: now
        },
        { merge: true }
      );

      if (currentDoc.exists) {
        updated += 1;
      } else {
        created += 1;
      }
      committed += 1;
    } catch (error) {
      errors.push({
        row: index + 2,
        code: "payroll_commit_error",
        message: error instanceof Error ? error.message : "Could not import payroll row."
      });
    }
  }

  return {
    committed,
    created,
    updated,
    errors
  };
}

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people", "read");
    const snapshot = await adminDb
      .collection("tenants")
      .doc(context.tenantId)
      .collection("integrationImports")
      .orderBy("createdAt", "desc")
      .limit(30)
      .get();

    const data = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>)
    }));

    return jsonOk({ data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people", "write");
    const parsed = importRequestSchema.parse(await req.json());
    const preview = buildImportPreview(parsed.dataset, parsed.content, parsed.delimiter || ",");

    if (parsed.mode === "preview") {
      return jsonOk({
        data: {
          dataset: parsed.dataset,
          source: parsed.source,
          preview: preview.validRows.slice(0, 20),
          summary: {
            received: preview.totalRows,
            valid: preview.validRows.length,
            errors: preview.errors.length
          },
          errors: preview.errors
        }
      });
    }

    if (preview.errors.length > 0) {
      throw new ApiError(400, "Import contains invalid rows. Run preview and fix errors before commit.");
    }

    const actor = {
      uid: context.uid,
      email: context.email,
      role: context.role
    };

    const commitResult =
      parsed.dataset === "people"
        ? await commitPeopleImport( context.tenantId, preview.validRows as CanonicalPeopleRow[], actor)
        : await commitPayrollImport(context.tenantId, parsed.source, preview.validRows as CanonicalPayrollRow[], actor);

    const allErrors = commitResult.errors;
    const status: IntegrationRunStatus =
      allErrors.length === 0
        ? "ok"
        : commitResult.committed > 0
          ? "partial"
          : "failed";

    const runId = await logImportRun(context.tenantId, {
      source: parsed.source,
      dataset: parsed.dataset,
      mode: parsed.mode,
      status,
      actor,
      totals: {
        received: preview.totalRows,
        valid: preview.validRows.length,
        committed: commitResult.committed,
        created: commitResult.created,
        updated: commitResult.updated,
        errors: allErrors.length
      },
      errors: allErrors
    });

    return jsonOk({
      data: {
        runId,
        dataset: parsed.dataset,
        source: parsed.source,
        status,
        summary: {
          received: preview.totalRows,
          valid: preview.validRows.length,
          committed: commitResult.committed,
          created: commitResult.created,
          updated: commitResult.updated,
          errors: allErrors.length
        },
        errors: allErrors
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}
