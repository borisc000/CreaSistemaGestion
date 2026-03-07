import { getModuleDefinition, MODULE_KEYS } from "@/modules/registry";
import type { ModuleKey, UserRole } from "@/types/domain";

export type ModuleAccessAction = "read" | "write";

export function hasModuleAccess(role: UserRole, moduleKey: ModuleKey, action: ModuleAccessAction = "read"): boolean {
  const moduleDefinition = getModuleDefinition(moduleKey);
  if (!moduleDefinition.enabled) {
    return false;
  }
  return moduleDefinition.accessPolicy[role]?.[action] ?? false;
}

export function canViewModule(role: UserRole, moduleKey: ModuleKey): boolean {
  const moduleDefinition = getModuleDefinition(moduleKey);
  if (!moduleDefinition.enabled) {
    return false;
  }

  const visibleForRoles = moduleDefinition.navigation?.visibleForRoles;
  if (visibleForRoles && !visibleForRoles.includes(role)) {
    return false;
  }
  return hasModuleAccess(role, moduleKey, "read");
}

export function getRoleModules(role: UserRole, action: ModuleAccessAction = "read"): ModuleKey[] {
  return MODULE_KEYS.filter((moduleKey) => hasModuleAccess(role, moduleKey, action));
}

export const ROLE_PERMISSIONS: Record<UserRole, ModuleKey[]> = {
  platform_admin: getRoleModules("platform_admin", "read"),
  tenant_admin: getRoleModules("tenant_admin", "read"),
  tender_lead: getRoleModules("tender_lead", "read"),
  contract_manager: getRoleModules("contract_manager", "read"),
  finance: getRoleModules("finance", "read"),
  hr: getRoleModules("hr", "read"),
  viewer: getRoleModules("viewer", "read")
};
