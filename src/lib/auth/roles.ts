import { USER_ROLES, type UserRole } from "@/types/auth";

export type TenantRole = Exclude<UserRole, "platform_admin">;

export const TENANT_MEMBER_ROLES = USER_ROLES.filter((role) => role !== "platform_admin") as TenantRole[];

export function normalizeLegacyRole(value: unknown): UserRole | null {
  if (value === "admin") {
    return "tenant_admin";
  }

  if (typeof value !== "string") {
    return null;
  }

  return USER_ROLES.includes(value as UserRole) ? (value as UserRole) : null;
}

export function parseTenantRole(value: unknown): TenantRole {
  const role = normalizeLegacyRole(value);
  if (!role || role === "platform_admin") {
    return "viewer";
  }
  return role;
}

export function parsePlatformRole(value: unknown): "platform_admin" | null {
  return value === "platform_admin" ? "platform_admin" : null;
}

export function resolveEffectiveRole(claims: {
  tenantRole?: unknown;
  role?: unknown;
  platformRole?: unknown;
}): UserRole {
  const platformRole = parsePlatformRole(claims.platformRole);
  if (platformRole) {
    return platformRole;
  }

  return parseTenantRole(claims.tenantRole ?? claims.role);
}
