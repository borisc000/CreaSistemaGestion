import { z } from "zod";
import type { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { assertPlatformAdmin } from "@/server/tenancy/access";
import { getTenantById, getTenantDomainByHost, listTenantDomains, upsertTenantDomain } from "@/server/tenancy/repository";

const createDomainSchema = z.object({
  tenantId: z.string().min(2),
  host: z.string().min(3),
  type: z.enum(["wildcard", "custom"]).default("custom"),
  verified: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional()
});

const patchDomainSchema = z.object({
  host: z.string().min(3),
  tenantId: z.string().min(2).optional(),
  verified: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional()
});

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "platform", "read");
    assertPlatformAdmin(context);
    const tenantId = req.nextUrl.searchParams.get("tenantId") || undefined;
    const data = await listTenantDomains(tenantId);
    return jsonOk({ data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "platform", "write");
    assertPlatformAdmin(context);
    const parsed = createDomainSchema.parse(await req.json());

    const tenant = await getTenantById(parsed.tenantId);
    if (!tenant) {
      throw new ApiError(404, "Tenant no encontrado.");
    }

    const domain = await upsertTenantDomain({
      host: parsed.host,
      tenantId: parsed.tenantId,
      type: parsed.type,
      verified: parsed.verified ?? false,
      status: parsed.status ?? "active"
    });

    return jsonOk({ data: domain }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "platform", "write");
    assertPlatformAdmin(context);
    const parsed = patchDomainSchema.parse(await req.json());

    const current = await getTenantDomainByHost(parsed.host);
    if (!current) {
      throw new ApiError(404, "Dominio no encontrado.");
    }

    const tenantId = parsed.tenantId || current.tenantId;
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      throw new ApiError(404, "Tenant no encontrado.");
    }

    const domain = await upsertTenantDomain({
      host: current.host,
      tenantId,
      type: current.type,
      verified: parsed.verified ?? current.verified,
      status: parsed.status ?? current.status
    });

    return jsonOk({ data: domain });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}
