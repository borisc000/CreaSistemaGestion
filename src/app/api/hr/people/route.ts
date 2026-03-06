import { z } from "zod";
import type { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { isPendingIdNumber, normalizeRut, tryNormalizeRut } from "@/server/domain/rut";
import {
  createEntity,
  getEntity,
  listEntities,
  patchEntity,
  type WriteActor
} from "@/server/repositories/firestore-repository";
import { validateModuleRelations } from "@/server/validation/relations";
import { personRecordCreateSchema, personRecordPatchSchema } from "@/server/validation/schemas";
import type { Candidate, PersonRecord, Vacancy } from "@/types/domain";

type PersonCreatePayload = z.infer<typeof personRecordCreateSchema>;
type PersonPatchPayload = z.infer<typeof personRecordPatchSchema>;

function normalizePersonIdData(idNumber: string): { idNumber: string; rutNormalized: string | null } {
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

  try {
    const rutNormalized = normalizeRut(trimmed);
    return {
      idNumber: rutNormalized,
      rutNormalized
    };
  } catch {
    throw new ApiError(400, "idNumber must be a valid RUT or PENDING-* token.");
  }
}

async function assertUniqueRutPerTenant(
  tenantId: string,
  rutNormalized: string | null,
  excludePersonId?: string
): Promise<void> {
  if (!rutNormalized) return;

  const people = await listEntities(tenantId, "peopleRecords");
  const duplicate = people.find((person) => {
    if (excludePersonId && person.id === excludePersonId) {
      return false;
    }
    const personRut = person.rutNormalized || tryNormalizeRut(person.idNumber);
    return personRut === rutNormalized;
  });

  if (duplicate) {
    throw new ApiError(409, "A person with this RUT already exists in this tenant.");
  }
}

type CandidateIntegrity = {
  candidate: Candidate | null;
  vacancy: Vacancy | null;
};

async function resolveCandidateIntegrity(tenantId: string, sourceCandidateId?: string | null): Promise<CandidateIntegrity> {
  if (!sourceCandidateId) {
    return {
      candidate: null,
      vacancy: null
    };
  }

  const candidate = (await getEntity(tenantId, "candidates", sourceCandidateId)) as Candidate | null;
  if (!candidate) {
    throw new ApiError(400, "sourceCandidateId does not reference an existing candidate.");
  }
  if (candidate.stage !== "hired") {
    throw new ApiError(409, "sourceCandidateId must reference a hired candidate.");
  }

  const vacancy = (await getEntity(tenantId, "vacancies", candidate.vacancyId)) as Vacancy | null;
  if (!vacancy) {
    throw new ApiError(400, "Source candidate vacancy was not found.");
  }

  return {
    candidate,
    vacancy
  };
}

function resolveContractId(
  payloadContractId: string | null,
  vacancyContractId: string | null
): string | null {
  if (payloadContractId && vacancyContractId && payloadContractId !== vacancyContractId) {
    throw new ApiError(409, "contractId does not match the source candidate contract.");
  }
  return payloadContractId || vacancyContractId || null;
}

async function ensureCandidateLink(
  tenantId: string,
  candidate: Candidate | null,
  personId: string,
  actor: WriteActor
): Promise<void> {
  if (!candidate) return;
  if (candidate.personRecordId === personId) return;

  await patchEntity(
    tenantId,
    "candidates",
    candidate.id,
    {
      personRecordId: personId
    },
    actor
  );
}

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people", "read");
    const data = await listEntities(context.tenantId, "peopleRecords");
    return jsonOk({ data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people", "write");
    const parsed = personRecordCreateSchema.parse(await req.json());
    const normalizedIdentity = normalizePersonIdData(parsed.idNumber);

    const integrity = await resolveCandidateIntegrity(context.tenantId, parsed.sourceCandidateId ?? null);
    const contractId = resolveContractId(parsed.contractId, integrity.vacancy?.contractId || null);

    const payload: PersonCreatePayload & { rutNormalized: string | null } = {
      ...parsed,
      idNumber: normalizedIdentity.idNumber,
      rutNormalized: normalizedIdentity.rutNormalized,
      contractId,
      sourceCandidateId: parsed.sourceCandidateId ?? null
    };

    await validateModuleRelations({
      tenantId: context.tenantId,
      moduleKey: "hr_people",
      relationSet: "peopleRecords",
      payload,
      mode: "create"
    });

    await assertUniqueRutPerTenant(context.tenantId, payload.rutNormalized);

    const created = await createEntity(context.tenantId, "peopleRecords", payload as never, {
      uid: context.uid,
      email: context.email,
      role: context.role
    });

    await ensureCandidateLink(
      context.tenantId,
      integrity.candidate,
      created.id,
      {
        uid: context.uid,
        email: context.email,
        role: context.role
      }
    );

    return jsonOk({ data: created }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people", "write");
    const parsed = personRecordPatchSchema.parse(await req.json()) as PersonPatchPayload;
    const existing = (await getEntity(context.tenantId, "peopleRecords", parsed.id)) as PersonRecord | null;
    if (!existing) {
      throw new ApiError(404, "Person not found.");
    }

    const mergedIdNumber = parsed.idNumber ?? existing.idNumber;
    const normalizedIdentity = normalizePersonIdData(mergedIdNumber);
    const mergedSourceCandidateId =
      parsed.sourceCandidateId !== undefined ? parsed.sourceCandidateId : existing.sourceCandidateId ?? null;
    const integrity = await resolveCandidateIntegrity(context.tenantId, mergedSourceCandidateId);
    const mergedContractId = resolveContractId(
      parsed.contractId !== undefined ? parsed.contractId : existing.contractId,
      integrity.vacancy?.contractId || null
    );

    const patchPayload = {
      ...parsed,
      idNumber: normalizedIdentity.idNumber,
      rutNormalized: normalizedIdentity.rutNormalized,
      sourceCandidateId: mergedSourceCandidateId,
      contractId: mergedContractId
    };
    const { id, ...patch } = patchPayload;

    await validateModuleRelations({
      tenantId: context.tenantId,
      moduleKey: "hr_people",
      relationSet: "peopleRecords",
      payload: patch,
      mode: "patch"
    });

    await assertUniqueRutPerTenant(context.tenantId, patch.rutNormalized, existing.id);

    await patchEntity(context.tenantId, "peopleRecords", id, patch as never, {
      uid: context.uid,
      email: context.email,
      role: context.role
    });

    await ensureCandidateLink(
      context.tenantId,
      integrity.candidate,
      existing.id,
      {
        uid: context.uid,
        email: context.email,
        role: context.role
      }
    );

    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}
