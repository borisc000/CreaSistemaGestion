import { z } from "zod";
import { type NextRequest } from "next/server";
import { getTenantContext } from "@/server/auth/request-context";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { createEntity, listEntities, patchEntity } from "@/server/repositories/firestore-repository";
import { assertContractExists, assertVacancyExists } from "@/server/validation/relations";
import {
  candidateCreateSchema,
  candidatePatchSchema,
  vacancyCreateSchema,
  vacancyPatchSchema
} from "@/server/validation/schemas";

const recruitingCreateSchema = z.discriminatedUnion("resource", [
  z.object({ resource: z.literal("vacancy"), payload: vacancyCreateSchema }),
  z.object({ resource: z.literal("candidate"), payload: candidateCreateSchema })
]);

const recruitingPatchSchema = z.discriminatedUnion("resource", [
  z.object({ resource: z.literal("vacancy"), payload: vacancyPatchSchema }),
  z.object({ resource: z.literal("candidate"), payload: candidatePatchSchema })
]);

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_recruiting");
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
    const context = await getTenantContext(req, "hr_recruiting");
    const parsed = recruitingCreateSchema.parse(await req.json());

    if (parsed.resource === "vacancy") {
      await assertContractExists(context.tenantId, parsed.payload.contractId);
      const created = await createEntity(context.tenantId, "vacancies", parsed.payload);
      return jsonOk({ data: created }, 201);
    }

    await assertVacancyExists(context.tenantId, parsed.payload.vacancyId);
    const created = await createEntity(context.tenantId, "candidates", {
      ...parsed.payload,
      hiredAt: parsed.payload.hiredAt ?? null
    });
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
    const context = await getTenantContext(req, "hr_recruiting");
    const parsed = recruitingPatchSchema.parse(await req.json());

    if (parsed.resource === "vacancy") {
      const { id, ...patch } = parsed.payload;
      await assertContractExists(context.tenantId, patch.contractId ?? null);
      await patchEntity(context.tenantId, "vacancies", id, patch);
      return jsonOk({ ok: true });
    }

    const { id, ...patch } = parsed.payload;
    if (patch.vacancyId) {
      await assertVacancyExists(context.tenantId, patch.vacancyId);
    }
    await patchEntity(context.tenantId, "candidates", id, patch);
    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}
