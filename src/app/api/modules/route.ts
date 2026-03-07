import type { NextRequest } from "next/server";
import { getEnabledModules } from "@/modules/registry";
import { jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { getTenantById } from "@/server/tenancy/repository";
import { isModuleEnabledForPlan } from "@/server/tenancy/service";
import type { ModuleKey } from "@/types/domain";

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "dashboard", "read");
    const tenant = context.tenantId ? await getTenantById(context.tenantId) : null;

    const data = getEnabledModules().map((moduleDefinition) => ({
      moduleKey: moduleDefinition.moduleKey,
      label: moduleDefinition.label,
      route: moduleDefinition.route,
      apiBase: moduleDefinition.apiBase,
      collectionKeys: moduleDefinition.collectionKeys,
      enabled: moduleDefinition.enabled,
      navigation: moduleDefinition.navigation || null,
      dashboardContributors: moduleDefinition.dashboardContributors || [],
      access: moduleDefinition.accessPolicy[context.role],
      enabledForTenant:
        moduleDefinition.moduleKey === "dashboard" ||
        isModuleEnabledForPlan(moduleDefinition.moduleKey as ModuleKey, tenant)
    }));

    return jsonOk({ data });
  } catch (error) {
    return jsonError(error);
  }
}
