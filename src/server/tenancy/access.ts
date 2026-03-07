import { ApiError } from "@/server/api/response";
import type { TenantContext } from "@/types/domain";

export function isPlatformAdmin(context: Pick<TenantContext, "role" | "platformRole">): boolean {
  return context.role === "platform_admin" || context.platformRole === "platform_admin";
}

export function isTenantAdmin(context: Pick<TenantContext, "role">): boolean {
  return context.role === "tenant_admin" || context.role === "platform_admin";
}

export function assertPlatformAdmin(context: Pick<TenantContext, "role" | "platformRole">) {
  if (!isPlatformAdmin(context)) {
    throw new ApiError(403, "Only platform_admin can access this endpoint.");
  }
}

export function assertTenantAdmin(context: Pick<TenantContext, "role">) {
  if (!isTenantAdmin(context)) {
    throw new ApiError(403, "Only tenant_admin can access this endpoint.");
  }
}
