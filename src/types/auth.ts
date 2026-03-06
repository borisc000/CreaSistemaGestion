export const USER_ROLES = ["admin", "tender_lead", "contract_manager", "finance", "hr", "viewer"] as const;

export type UserRole = (typeof USER_ROLES)[number];
