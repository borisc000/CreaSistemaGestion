import { z } from "zod";
import type { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { ensureDefaultAccreditationTemplates } from "@/server/domain/accreditation";
import {
  createEntity,
  getEntity,
  listEntities,
  patchEntity
} from "@/server/repositories/firestore-repository";
import { validateModuleRelations } from "@/server/validation/relations";
import {
  accreditationTemplateCreateSchema,
  accreditationTemplatePatchSchema
} from "@/server/validation/schemas";
import type { AccreditationTemplate, Contract } from "@/types/domain";

type AccreditationTemplatePayload = Omit<AccreditationTemplate, "id" | "createdAt" | "updatedAt">;

function normalizeText(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

async function normalizeTemplatePayload(
  tenantId: string,
  payload: z.infer<typeof accreditationTemplateCreateSchema>
): Promise<AccreditationTemplatePayload> {
  if (payload.scope === "global") {
    return {
      code: payload.code,
      name: payload.name,
      scope: payload.scope,
      clientName: null,
      contractId: null,
      required: payload.required,
      validityDays: payload.validityDays ?? null,
      enabled: payload.enabled,
      sortOrder: payload.sortOrder
    };
  }

  if (payload.scope === "client") {
    if (!payload.clientName || !payload.clientName.trim()) {
      throw new ApiError(400, "clientName is required when scope is client.");
    }
    return {
      code: payload.code,
      name: payload.name,
      scope: payload.scope,
      clientName: payload.clientName.trim(),
      contractId: null,
      required: payload.required,
      validityDays: payload.validityDays ?? null,
      enabled: payload.enabled,
      sortOrder: payload.sortOrder
    };
  }

  if (!payload.contractId) {
    throw new ApiError(400, "contractId is required when scope is contract.");
  }
  const contract = (await getEntity(tenantId, "contracts", payload.contractId)) as Contract | null;
  if (!contract) {
    throw new ApiError(400, "contractId does not reference an existing contract.");
  }

  return {
    code: payload.code,
    name: payload.name,
    scope: payload.scope,
    clientName: payload.clientName?.trim() || contract.client,
    contractId: payload.contractId,
    required: payload.required,
    validityDays: payload.validityDays ?? null,
    enabled: payload.enabled,
    sortOrder: payload.sortOrder
  };
}

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people", "read");
    await ensureDefaultAccreditationTemplates(context.tenantId);

    const clientName = req.nextUrl.searchParams.get("clientName");
    const contractId = req.nextUrl.searchParams.get("contractId");
    const includeDisabled = req.nextUrl.searchParams.get("includeDisabled") === "true";

    const templates = (await listEntities(context.tenantId, "accreditationTemplates")) as AccreditationTemplate[];
    const data = templates
      .filter((template) => (includeDisabled ? true : template.enabled))
      .filter((template) => (contractId ? template.contractId === contractId : true))
      .filter((template) => {
        if (!clientName) return true;
        return normalizeText(template.clientName) === normalizeText(clientName);
      })
      .sort((left, right) => (left.sortOrder !== right.sortOrder ? left.sortOrder - right.sortOrder : left.name.localeCompare(right.name)));

    return jsonOk({ data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people", "write");
    await ensureDefaultAccreditationTemplates(context.tenantId);

    const parsed = accreditationTemplateCreateSchema.parse(await req.json());
    const normalized = await normalizeTemplatePayload(context.tenantId, parsed);

    await validateModuleRelations({
      tenantId: context.tenantId,
      moduleKey: "hr_people",
      relationSet: "accreditationTemplates",
      payload: normalized,
      mode: "create"
    });

    const created = await createEntity(context.tenantId, "accreditationTemplates", normalized, {
      uid: context.uid,
      email: context.email,
      role: context.role
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
    const context = await getTenantContext(req, "hr_people", "write");
    await ensureDefaultAccreditationTemplates(context.tenantId);

    const parsed = accreditationTemplatePatchSchema.parse(await req.json());
    const existing = (await getEntity(context.tenantId, "accreditationTemplates", parsed.id)) as AccreditationTemplate | null;
    if (!existing) {
      throw new ApiError(404, "Template not found.");
    }

    const merged = await normalizeTemplatePayload(context.tenantId, {
      code: parsed.code ?? existing.code,
      name: parsed.name ?? existing.name,
      scope: parsed.scope ?? existing.scope,
      clientName: parsed.clientName !== undefined ? parsed.clientName : existing.clientName,
      contractId: parsed.contractId !== undefined ? parsed.contractId : existing.contractId,
      required: parsed.required ?? existing.required,
      validityDays: parsed.validityDays !== undefined ? parsed.validityDays : existing.validityDays,
      enabled: parsed.enabled ?? existing.enabled,
      sortOrder: parsed.sortOrder ?? existing.sortOrder
    });

    await validateModuleRelations({
      tenantId: context.tenantId,
      moduleKey: "hr_people",
      relationSet: "accreditationTemplates",
      payload: merged,
      mode: "patch"
    });

    await patchEntity(context.tenantId, "accreditationTemplates", parsed.id, merged, {
      uid: context.uid,
      email: context.email,
      role: context.role
    });

    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}
