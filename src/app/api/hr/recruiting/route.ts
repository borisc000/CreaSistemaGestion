import { z } from "zod";
import { type NextRequest } from "next/server";
import { getTenantContext } from "@/server/auth/request-context";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { createEntity, getEntity, listEntities, patchEntity } from "@/server/repositories/firestore-repository";
import type { WriteActor } from "@/server/repositories/firestore-repository";
import { validateModuleRelations } from "@/server/validation/relations";
import {
  candidateCreateSchema,
  candidatePatchSchema,
  vacancyCreateSchema,
  vacancyPatchSchema
} from "@/server/validation/schemas";
import type { Candidate, PersonRecord, Vacancy } from "@/types/domain";

const recruitingCreateSchema = z.discriminatedUnion("resource", [
  z.object({ resource: z.literal("vacancy"), payload: vacancyCreateSchema }),
  z.object({ resource: z.literal("candidate"), payload: candidateCreateSchema })
]);

const recruitingPatchSchema = z.discriminatedUnion("resource", [
  z.object({ resource: z.literal("vacancy"), payload: vacancyPatchSchema }),
  z.object({ resource: z.literal("candidate"), payload: candidatePatchSchema })
]);

function buildPendingIdNumber(candidateId: string): string {
  return `PENDING-${candidateId.slice(0, 8).toUpperCase()}`;
}

async function ensurePersonRecordForHiredCandidate(
  tenantId: string,
  candidate: Candidate,
  actor: WriteActor
): Promise<string | null> {
  if (candidate.stage !== "hired") {
    return candidate.personRecordId ?? null;
  }

  if (candidate.personRecordId) {
    const linkedPerson = await getEntity(tenantId, "peopleRecords", candidate.personRecordId);
    if (linkedPerson) {
      return linkedPerson.id;
    }
  }

  const peopleRecords = await listEntities(tenantId, "peopleRecords");
  const existingLinkedRecord = peopleRecords.find((person) => person.sourceCandidateId === candidate.id);
  if (existingLinkedRecord) {
    return existingLinkedRecord.id;
  }

  const vacancy = (await getEntity(tenantId, "vacancies", candidate.vacancyId)) as Vacancy | null;
  if (!vacancy) {
    throw new ApiError(400, "Referenced vacancy does not exist.");
  }

  const createdPerson = await createEntity(
    tenantId,
    "peopleRecords",
    {
      fullName: candidate.name,
      idNumber: buildPendingIdNumber(candidate.id),
      rutNormalized: null,
      position: vacancy.title,
      contractId: vacancy.contractId ?? null,
      hireDate: candidate.hiredAt || new Date().toISOString().slice(0, 10),
      employmentStatus: "active",
      sourceCandidateId: candidate.id
    } as Omit<PersonRecord, "id" | "createdAt" | "updatedAt">,
    actor
  );

  return createdPerson.id;
}

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_recruiting", "read");
    const [vacancies, candidates] = await Promise.all([
      listEntities(context.tenantId, "vacancies"),
      listEntities(context.tenantId, "candidates")
    ]);
    return jsonOk({ data: { vacancies, candidates } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_recruiting", "write");
    const parsed = recruitingCreateSchema.parse(await req.json());

    if (parsed.resource === "vacancy") {
      await validateModuleRelations({
        tenantId: context.tenantId,
        moduleKey: "hr_recruiting",
        relationSet: "vacancies",
        payload: parsed.payload,
        mode: "create"
      });

      const created = await createEntity(context.tenantId, "vacancies", parsed.payload, {
        uid: context.uid,
        email: context.email,
        role: context.role
      });
      return jsonOk({ data: created }, 201);
    }

    await validateModuleRelations({
      tenantId: context.tenantId,
      moduleKey: "hr_recruiting",
      relationSet: "candidates",
      payload: parsed.payload,
      mode: "create"
    });

    const created = await createEntity(
      context.tenantId,
      "candidates",
      {
        ...parsed.payload,
        hiredAt: parsed.payload.hiredAt ?? null,
        personRecordId: parsed.payload.personRecordId ?? null
      },
      {
        uid: context.uid,
        email: context.email,
        role: context.role
      }
    );

    const personRecordId = await ensurePersonRecordForHiredCandidate(context.tenantId, created as Candidate, {
      uid: context.uid,
      email: context.email,
      role: context.role
    });
    if (personRecordId && personRecordId !== (created as Candidate).personRecordId) {
      await patchEntity(
        context.tenantId,
        "candidates",
        created.id,
        { personRecordId },
        {
          uid: context.uid,
          email: context.email,
          role: context.role
        }
      );
      (created as Candidate).personRecordId = personRecordId;
    }

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
    const context = await getTenantContext(req, "hr_recruiting", "write");
    const parsed = recruitingPatchSchema.parse(await req.json());

    if (parsed.resource === "vacancy") {
      const { id, ...patch } = parsed.payload;

      await validateModuleRelations({
        tenantId: context.tenantId,
        moduleKey: "hr_recruiting",
        relationSet: "vacancies",
        payload: patch,
        mode: "patch"
      });

      await patchEntity(
        context.tenantId,
        "vacancies",
        id,
        patch,
        {
          uid: context.uid,
          email: context.email,
          role: context.role
        }
      );
      return jsonOk({ ok: true });
    }

    const { id, ...patch } = parsed.payload;
    const existingCandidate = (await getEntity(context.tenantId, "candidates", id)) as Candidate | null;
    if (!existingCandidate) {
      throw new ApiError(404, "Candidate not found.");
    }

    await validateModuleRelations({
      tenantId: context.tenantId,
      moduleKey: "hr_recruiting",
      relationSet: "candidates",
      payload: patch,
      mode: "patch"
    });

    await patchEntity(
      context.tenantId,
      "candidates",
      id,
      patch,
      {
        uid: context.uid,
        email: context.email,
        role: context.role
      }
    );

    const mergedCandidate: Candidate = {
      ...existingCandidate,
      ...patch,
      id
    };

    const personRecordId = await ensurePersonRecordForHiredCandidate(context.tenantId, mergedCandidate, {
      uid: context.uid,
      email: context.email,
      role: context.role
    });
    if (personRecordId && personRecordId !== mergedCandidate.personRecordId) {
      await patchEntity(
        context.tenantId,
        "candidates",
        id,
        { personRecordId },
        {
          uid: context.uid,
          email: context.email,
          role: context.role
        }
      );
    }

    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}
