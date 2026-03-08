import { z } from "zod";
import type { NextRequest } from "next/server";
import { CORRESPONDENCE_DATA_SOURCE_TYPES } from "@/types/catalogs";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { createCorrespondenceUploadIntent } from "@/server/domain/correspondence-upload-intents";

const uploadIntentSchema = z.object({
  sourceType: z.enum(CORRESPONDENCE_DATA_SOURCE_TYPES),
  fileName: z.string().min(3),
  mimeType: z.string().min(3),
  sizeBytes: z.number().int().positive()
});

export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "correspondencia_cruzada", "write");
    const parsed = uploadIntentSchema.parse(await req.json());

    const data = await createCorrespondenceUploadIntent({
      tenantId: context.tenantId,
      kind: "data_source",
      sourceType: parsed.sourceType,
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

