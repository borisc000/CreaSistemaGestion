import { z } from "zod";
import type { NextRequest } from "next/server";
import { getTenantContext } from "@/server/auth/request-context";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import {
  createEntity,
  getEntity,
  listEntities,
  patchEntity
} from "@/server/repositories/firestore-repository";
import { deriveDocumentStatus } from "@/server/domain/document-status";
import { validateModuleRelations } from "@/server/validation/relations";
import { personDocumentCreateSchema, personDocumentPatchSchema } from "@/server/validation/schemas";

function buildStoragePath(tenantId: string, personId: string, fileName: string) {
  const cleanName = fileName.replace(/\s+/g, "_");
  return `tenants/${tenantId}/people/${personId}/documents/${Date.now()}-${cleanName}`;
}

function normalizeAccreditationMetadata(payload: {
  templateCode?: string | null;
  scope?: "global" | "client" | "contract";
  clientName?: string | null;
  contractId?: string | null;
  validFrom?: string | null;
  reusable?: boolean;
}) {
  const scope = payload.scope ?? "global";
  const templateCode = payload.templateCode?.trim() || null;
  const validFrom = payload.validFrom || null;
  const reusable = payload.reusable ?? true;
  let clientName = payload.clientName?.trim() || null;
  let contractId = payload.contractId || null;

  if (scope === "global") {
    clientName = null;
    contractId = null;
  } else if (scope === "client") {
    contractId = null;
  } else if (!contractId) {
    throw new ApiError(400, "contractId is required when scope is contract.");
  }

  return {
    templateCode,
    scope,
    clientName,
    contractId,
    validFrom,
    reusable
  };
}

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people", "read");
    const data = await listEntities(context.tenantId, "personDocuments");
    return jsonOk({ data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people", "write");
    const body = await req.json();
    const filePath = body.filePath || buildStoragePath(context.tenantId, body.personId, body.fileName);
    const parsed = personDocumentCreateSchema.parse({
      ...body,
      filePath
    });
    const accreditation = normalizeAccreditationMetadata(parsed);

    await validateModuleRelations({
      tenantId: context.tenantId,
      moduleKey: "hr_people",
      relationSet: "personDocuments",
      payload: {
        ...parsed,
        ...accreditation
      },
      mode: "create"
    });

    const created = await createEntity(
      context.tenantId,
      "personDocuments",
      {
        ...parsed,
        ...accreditation,
        filePath,
        expiryDate: parsed.expiryDate ?? null,
        status: deriveDocumentStatus(parsed.expiryDate ?? null)
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
    const context = await getTenantContext(req, "hr_people", "write");
    const payload = personDocumentPatchSchema.parse(await req.json());
    const { id, ...patch } = payload;
    const existing = await getEntity(context.tenantId, "personDocuments", id);
    if (!existing) {
      throw new ApiError(404, "Document not found.");
    }

    const accreditation = normalizeAccreditationMetadata({
      templateCode: patch.templateCode !== undefined ? patch.templateCode : existing.templateCode ?? null,
      scope: patch.scope !== undefined ? patch.scope : existing.scope ?? "global",
      clientName: patch.clientName !== undefined ? patch.clientName : existing.clientName ?? null,
      contractId: patch.contractId !== undefined ? patch.contractId : existing.contractId ?? null,
      validFrom: patch.validFrom !== undefined ? patch.validFrom : existing.validFrom ?? null,
      reusable: patch.reusable !== undefined ? patch.reusable : existing.reusable ?? true
    });

    await validateModuleRelations({
      tenantId: context.tenantId,
      moduleKey: "hr_people",
      relationSet: "personDocuments",
      payload: {
        ...patch,
        ...accreditation
      },
      mode: "patch"
    });

    const mergedExpiryDate = patch.expiryDate ?? existing.expiryDate;
    await patchEntity(
      context.tenantId,
      "personDocuments",
      id,
      {
        ...patch,
        ...accreditation,
        status: deriveDocumentStatus(mergedExpiryDate ?? null)
      },
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
