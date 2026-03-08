import { z } from "zod";
import type { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { consumeCorrespondenceUploadIntent } from "@/server/domain/correspondence-upload-intents";
import { downloadStorageFile, extractColumns, parseDataSourceBuffer } from "@/server/domain/correspondence";
import { createEntity, listEntities, patchEntity } from "@/server/repositories/firestore-repository";
import { correspondenceDataSourceCreateSchema, correspondenceDataSourcePatchSchema } from "@/server/validation/schemas";

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "correspondencia_cruzada", "read");
    const data = await listEntities(context.tenantId, "correspondenceDataSources");
    return jsonOk({ data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "correspondencia_cruzada", "write");
    const parsed = correspondenceDataSourceCreateSchema.parse(await req.json());

    const { uploadPath } = await consumeCorrespondenceUploadIntent({
      tenantId: context.tenantId,
      uploadIntentId: parsed.uploadIntentId,
      kind: "data_source",
      expectedFileName: parsed.fileName,
      expectedSourceType: parsed.sourceType,
      actor: {
        uid: context.uid,
        email: context.email,
        role: context.role
      }
    });

    const sourceBuffer = await downloadStorageFile(uploadPath);
    const rows = parseDataSourceBuffer(sourceBuffer, parsed.sourceType);
    const columns = extractColumns(rows);
    const created = await createEntity(
      context.tenantId,
      "correspondenceDataSources",
      {
        name: parsed.name,
        sourceType: parsed.sourceType,
        fileName: parsed.fileName,
        filePath: uploadPath,
        rowsCount: rows.length,
        columns,
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
    const parsed = correspondenceDataSourcePatchSchema.parse(await req.json());
    const { id, ...patch } = parsed;

    await patchEntity(
      context.tenantId,
      "correspondenceDataSources",
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

