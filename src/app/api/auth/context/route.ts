import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/server/api/response";
import { getAuthContext } from "@/server/auth/request-context";
import { getTenantById } from "@/server/tenancy/repository";
import { getPreferredTenantHost } from "@/server/tenancy/service";
import type { UserTenantMembershipView } from "@/types/domain";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const tenant = auth.tenantId ? await getTenantById(auth.tenantId) : null;

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
    // Tenant creation/assignment is managed only by platform admin from /platform.
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
        tenant,
        memberships: membershipViews
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
