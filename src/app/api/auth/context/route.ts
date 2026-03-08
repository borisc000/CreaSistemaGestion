import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/server/api/response";
import { getModulePolicySnapshot, resolveAllModuleAccess } from "@/server/auth/module-policy";
import { getAuthContext } from "@/server/auth/request-context";
import { getTenantById } from "@/server/tenancy/repository";
import { getPreferredTenantHost } from "@/server/tenancy/service";
import { resolveTenantSettings } from "@/server/tenancy/settings";
import type { UserTenantMembershipView } from "@/types/domain";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const [tenant, policy] = await Promise.all([
      auth.tenantId ? getTenantById(auth.tenantId) : Promise.resolve(null),
      getModulePolicySnapshot()
    ]);
    const moduleAccess = resolveAllModuleAccess({
      role: auth.role,
      tenant,
      policy
    });
    const tenantSettings = resolveTenantSettings(tenant);

    const activeMemberships = auth.memberships.filter((membership) => membership.status === "active");
    const membershipViews: UserTenantMembershipView[] = [];

    for (const membership of activeMemberships) {
      const membershipTenant = await getTenantById(membership.tenantId);
      if (!membershipTenant) continue;
      membershipViews.push({
        tenantId: membership.tenantId,
        tenantName: membershipTenant.name,
        tenantSlug: membershipTenant.slug,
        tenantStatus: membershipTenant.status,
        membershipRole: membership.role,
        membershipStatus: membership.status,
        preferredHost: await getPreferredTenantHost(membership.tenantId)
      });
    }

    // Onboarding self-serve is deprecated in this phase.
    // Tenant creation/assignment is managed only by platform admin from /configuraciones/plataforma.
    const onboardingRequired = false;

    return jsonOk({
      data: {
        uid: auth.uid,
        email: auth.email,
        host: auth.host,
        resolvedTenantId: auth.resolvedTenantId,
        onboardingRequired,
        roles: {
          effectiveRole: auth.role,
          tenantRole: auth.tenantRole,
          platformRole: auth.platformRole
        },
        moduleAccess,
        tenantSettings,
        tenant,
        memberships: membershipViews
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
