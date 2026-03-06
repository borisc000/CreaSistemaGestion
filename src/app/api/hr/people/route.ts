import { z } from "zod";
import type { NextRequest } from "next/server";
import { getTenantContext } from "@/server/auth/request-context";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { createEntity, listEntities, patchEntity } from "@/server/repositories/firestore-repository";
import { assertContractExists } from "@/server/validation/relations";
import { personRecordCreateSchema, personRecordPatchSchema } from "@/server/validation/schemas";

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people");
    const data = await listEntities(context.tenantId, "peopleRecords");
    return jsonOk({ data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people");
    const payload = personRecordCreateSchema.parse(await req.json());
    await assertContractExists(context.tenantId, payload.contractId);
    const created = await createEntity(context.tenantId, "peopleRecords", payload);
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
    const context = await getTenantContext(req, "hr_people");
    const payload = personRecordPatchSchema.parse(await req.json());
    const { id, ...patch } = payload;
    await assertContractExists(context.tenantId, patch.contractId ?? null);
    await patchEntity(context.tenantId, "peopleRecords", id, patch);
    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}