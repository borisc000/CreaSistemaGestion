export const USER_ROLES = [
  "platform_admin",
  "tenant_admin",
  "tender_lead",
  "contract_manager",
  "finance",
  "hr",
  "viewer"
] as const;

export type UserRole = (typeof USER_ROLES)[number];
