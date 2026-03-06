import type { ModuleKey, UserRole } from "@/types/domain";

export const ROLE_PERMISSIONS: Record<UserRole, ModuleKey[]> = {
  admin: ["dashboard", "tenders", "contracts", "operations", "finance", "hr_recruiting", "hr_people"],
  tender_lead: ["dashboard", "tenders", "contracts"],
  contract_manager: ["dashboard", "contracts", "operations"],
  finance: ["dashboard", "finance"],
  hr: ["dashboard", "hr_recruiting", "hr_people"],
  viewer: ["dashboard"]
};

export function hasModuleAccess(role: UserRole, moduleKey: ModuleKey): boolean {
  return ROLE_PERMISSIONS[role]?.includes(moduleKey) ?? false;
}