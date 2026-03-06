export const DEFAULT_TENANT_ID = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || "crea-default";
export const DEFAULT_DEV_ROLE = (process.env.NEXT_PUBLIC_DEFAULT_ROLE || "viewer") as
  | "admin"
  | "tender_lead"
  | "contract_manager"
  | "finance"
  | "hr"
  | "viewer";

export const ALLOW_DEV_AUTH_BYPASS = process.env.ALLOW_DEV_AUTH_BYPASS === "true";