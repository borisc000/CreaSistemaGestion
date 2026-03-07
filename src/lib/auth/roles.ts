import { USER_ROLES, type UserRole } from "@/types/auth";

export type TenantRole = Exclude<UserRole, "platform_admin">;

export const TENANT_MEMBER_ROLES = USER_ROLES.filter((role) => role !== "platform_admin") as TenantRole[];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  platform_admin: "Administrador Plataforma",
  tenant_admin: "Administrador Empresa",
  tenant_manager: "Gestor Empresa",
  tender_lead: "Lider Licitaciones",
  contract_manager: "Jefe Contratos",
  finance: "Finanzas",
  hr: "RRHH",
  viewer: "Solo lectura"
};

export const TENANT_ROLE_LABELS: Record<TenantRole, string> = {
  tenant_admin: USER_ROLE_LABELS.tenant_admin,
  tenant_manager: USER_ROLE_LABELS.tenant_manager,
  tender_lead: USER_ROLE_LABELS.tender_lead,
  contract_manager: USER_ROLE_LABELS.contract_manager,
  finance: USER_ROLE_LABELS.finance,
  hr: USER_ROLE_LABELS.hr,
  viewer: USER_ROLE_LABELS.viewer
};

export function getUserRoleLabel(role: UserRole): string {
  return USER_ROLE_LABELS[role];
}

export function getTenantRoleLabel(role: TenantRole): string {
  return TENANT_ROLE_LABELS[role];
}

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
