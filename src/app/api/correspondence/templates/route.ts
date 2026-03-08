import { z } from "zod";
import type { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { consumeCorrespondenceUploadIntent } from "@/server/domain/correspondence-upload-intents";
import { detectTemplateKeysFromDocx, downloadStorageFile } from "@/server/domain/correspondence";
import { createEntity, listEntities, patchEntity } from "@/server/repositories/firestore-repository";
import { correspondenceTemplateCreateSchema, correspondenceTemplatePatchSchema } from "@/server/validation/schemas";

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "correspondencia_cruzada", "read");
    const data = await listEntities(context.tenantId, "correspondenceTemplates");
    return jsonOk({ data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "correspondencia_cruzada", "write");
    const parsed = correspondenceTemplateCreateSchema.parse(await req.json());

    const { uploadPath } = await consumeCorrespondenceUploadIntent({
      tenantId: context.tenantId,
      uploadIntentId: parsed.uploadIntentId,
      kind: "template",
      expectedFileName: parsed.fileName,
      actor: {
        uid: context.uid,
        email: context.email,
        role: context.role
      }
    });

    const templateBuffer = await downloadStorageFile(uploadPath);
    const keys = detectTemplateKeysFromDocx(templateBuffer, parsed.delimiter);
    const created = await createEntity(
      context.tenantId,
      "correspondenceTemplates",
      {
        name: parsed.name,
        fileName: parsed.fileName,
        filePath: uploadPath,
        delimiter: parsed.delimiter,
        keys,
        status: parsed.status
      },
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
    const context = await getTenantContext(req, "correspondencia_cruzada", "write");
    const parsed = correspondenceTemplatePatchSchema.parse(await req.json());
    const { id, ...patch } = parsed;

    await patchEntity(
      context.tenantId,
      "correspondenceTemplates",
      id,
      patch,
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

