import { z } from "zod";
import type { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { getEntity } from "@/server/repositories/firestore-repository";
import { createDocumentUploadIntent } from "@/server/domain/document-upload-intents";
import { documentUploadIntentCreateSchema } from "@/server/validation/schemas";

export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people", "write");
    const parsed = documentUploadIntentCreateSchema.parse(await req.json());

    const person = await getEntity(context.tenantId, "peopleRecords", parsed.personId);
    if (!person) {
      throw new ApiError(404, "Person not found.");
    }

    const data = await createDocumentUploadIntent({
      tenantId: context.tenantId,
      personId: parsed.personId,
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.sizeBytes,
      actor: {
        uid: context.uid,
        email: context.email,
        role: context.role
      }
    });

    return jsonOk({ data }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}
