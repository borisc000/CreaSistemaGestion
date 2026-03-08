import { z } from "zod";
import type { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { getTenantById, patchTenant } from "@/server/tenancy/repository";
import { isTenantAdmin } from "@/server/tenancy/access";
import { mergeTenantSettings, resolveTenantSettings } from "@/server/tenancy/settings";

const patchCompanySettingsSchema = z.object({
  currency: z.enum(["CLP", "USD"])
});

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "admin_users", "read");
    const tenant = await getTenantById(context.tenantId);
    if (!tenant) {
      throw new ApiError(404, "Tenant no encontrado.");
    }
    return jsonOk({
      data: resolveTenantSettings(tenant)
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "admin_users", "write");
    if (!isTenantAdmin(context)) {
      throw new ApiError(403, "Only tenant_admin or platform_admin can update company settings.");
    }

    const parsed = patchCompanySettingsSchema.parse(await req.json());
    const tenant = await getTenantById(context.tenantId);
    if (!tenant) {
      throw new ApiError(404, "Tenant no encontrado.");
    }

    const settings = mergeTenantSettings(tenant.settings, {
      company: {
        currency: parsed.currency
      }
    });

    await patchTenant(context.tenantId, { settings });
    return jsonOk({
      ok: true,
      data: {
        company: {
          currency: parsed.currency
        }
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}
