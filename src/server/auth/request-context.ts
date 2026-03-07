import type { NextRequest } from "next/server";
import { normalizeLegacyRole, parsePlatformRole } from "@/lib/auth/roles";
import { adminAuth } from "@/lib/firebase/admin";
import { ALLOW_DEV_AUTH_BYPASS, DEFAULT_DEV_ROLE, DEFAULT_TENANT_ID } from "@/lib/tenant";
import { ApiError } from "@/server/api/response";
import { hasModuleAccess, type ModuleAccessAction } from "@/server/auth/roles";
import { getRequestHost, resolveTenantIdForHost } from "@/server/tenancy/host-resolution";
import { getTenantById, listMembershipsByUid } from "@/server/tenancy/repository";
import { isModuleEnabledForPlan } from "@/server/tenancy/service";
import type { ModuleKey, TenantContext, TenantUserMembership, UserRole } from "@/types/domain";

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export type AuthContext = {
  uid: string;
  email: string | null;
  tenantId: string | null;
  tenantRole: UserRole | null;
  platformRole: "platform_admin" | null;
  role: UserRole;
  host: string | null;
  resolvedTenantId: string | null;
  memberships: TenantUserMembership[];
};

function parseDevRole(rawRole: string | null): UserRole {
  const normalized = normalizeLegacyRole(rawRole ?? DEFAULT_DEV_ROLE);
  if (!normalized) {
    return "viewer";
  }
  return normalized;
}

function isMembershipActive(membership: TenantUserMembership): boolean {
  return membership.status === "active";
}

export async function getAuthContext(req: NextRequest): Promise<AuthContext> {
  const host = getRequestHost(req.headers);

  if (ALLOW_DEV_AUTH_BYPASS) {
    const devRole = parseDevRole(req.headers.get("x-dev-role"));
    const devTenantId = req.headers.get("x-dev-tenant-id") || DEFAULT_TENANT_ID;
    const platformRole = devRole === "platform_admin" ? "platform_admin" : null;
    const tenantRole = platformRole ? "tenant_admin" : devRole;

    return {
      uid: "dev-user",
      email: "dev@local",
      tenantId: devTenantId,
      tenantRole,
      platformRole,
      role: devRole,
      host,
      resolvedTenantId: devTenantId,
      memberships: []
    };
  }

  const token = getBearerToken(req);
  if (!token) {
    throw new ApiError(401, "Missing bearer token.");
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch {
    throw new ApiError(401, "Invalid or expired auth token.");
  }

  const claimsTenantId = typeof decoded.tenantId === "string" ? decoded.tenantId : null;
  const platformRole = parsePlatformRole(decoded.platformRole);
  const [resolvedTenantId, memberships] = await Promise.all([
    resolveTenantIdForHost(host),
    listMembershipsByUid(decoded.uid)
  ]);

  const activeMemberships = memberships.filter(isMembershipActive);
  const membershipsByTenant = new Map(activeMemberships.map((membership) => [membership.tenantId, membership]));

  let selectedMembership: TenantUserMembership | null = null;
  if (resolvedTenantId) {
    selectedMembership = membershipsByTenant.get(resolvedTenantId) || null;
    if (!selectedMembership && !platformRole) {
      throw new ApiError(403, "Host resuelto a un tenant donde el usuario no tiene acceso.");
    }
  }

  if (!selectedMembership && claimsTenantId) {
    selectedMembership = membershipsByTenant.get(claimsTenantId) || null;
  }

  if (!selectedMembership && activeMemberships.length > 0) {
    selectedMembership = activeMemberships[0];
  }

  const tenantId = selectedMembership?.tenantId || (platformRole ? claimsTenantId || resolvedTenantId || null : null);
  const tenantRole = selectedMembership?.role || null;
  const role = platformRole ? "platform_admin" : tenantRole || "viewer";

  return {
    uid: decoded.uid,
    email: decoded.email || null,
    tenantId: tenantId || null,
    tenantRole,
    platformRole,
    role,
    host,
    resolvedTenantId,
    memberships
  };
}

export async function getTenantContext(
  req: NextRequest,
  moduleKey: ModuleKey,
  action: ModuleAccessAction = "read"
): Promise<TenantContext> {
  const context = await getAuthContext(req);

  if (!hasModuleAccess(context.role, moduleKey, action)) {
    throw new ApiError(403, `Role has no ${action} permission for this module.`);
  }

  if (moduleKey !== "platform" && !context.tenantId) {
    throw new ApiError(403, "No tenant context resolved for this request.");
  }

  if (moduleKey !== "platform" && context.tenantId) {
    const tenant = await getTenantById(context.tenantId);
    if (!tenant) {
      throw new ApiError(403, "Tenant no encontrado.");
    }
    if (tenant.status !== "active") {
      throw new ApiError(403, "El tenant esta suspendido.");
    }
    if (moduleKey !== "dashboard" && !isModuleEnabledForPlan(moduleKey, tenant)) {
      throw new ApiError(403, "Tu plan actual no habilita este modulo.");
    }
  }

  return {
    tenantId: context.tenantId || "platform-global",
    uid: context.uid,
    role: context.role,
    email: context.email,
    tenantRole: context.tenantRole,
    platformRole: context.platformRole,
    host: context.host
  };
}
