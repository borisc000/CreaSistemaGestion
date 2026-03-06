import type { UserRole } from "@/types/auth";

export const DEFAULT_TENANT_ID = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || "crea-default";
export const DEFAULT_DEV_ROLE = (process.env.NEXT_PUBLIC_DEFAULT_ROLE || "viewer") as UserRole;

export const ALLOW_DEV_AUTH_BYPASS = process.env.ALLOW_DEV_AUTH_BYPASS === "true";
