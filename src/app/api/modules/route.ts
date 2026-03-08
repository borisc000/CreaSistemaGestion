import type { NextRequest } from "next/server";
import { getEnabledModules } from "@/modules/registry";
import { jsonError, jsonOk } from "@/server/api/response";
import { getModulePolicySnapshot, resolveModuleAccessSnapshot } from "@/server/auth/module-policy";
import { getTenantContext } from "@/server/auth/request-context";
import { getTenantById } from "@/server/tenancy/repository";
import type { ModuleKey } from "@/types/domain";

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "dashboard", "read");
    const [tenant, policy] = await Promise.all([
      context.tenantId ? getTenantById(context.tenantId) : Promise.resolve(null),
      getModulePolicySnapshot()
    ]);

    const data = getEnabledModules().map((moduleDefinition) => {
      const access = resolveModuleAccessSnapshot({
        moduleKey: moduleDefinition.moduleKey as ModuleKey,
        role: context.role,
        tenant,
        policy
      });
      return {
        moduleKey: moduleDefinition.moduleKey,
        label: moduleDefinition.label,
        route: moduleDefinition.route,
        apiBase: moduleDefinition.apiBase,
        collectionKeys: moduleDefinition.collectionKeys,
        enabled: moduleDefinition.enabled,
        navigation: moduleDefinition.navigation || null,
        dashboardContributors: moduleDefinition.dashboardContributors || [],
        access,
        enabledForTenant: access.enabledForTenant
      };
    });

    return jsonOk({ data });
  } catch (error) {
    return jsonError(error);
  }
}
