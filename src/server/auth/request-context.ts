import type { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { ALLOW_DEV_AUTH_BYPASS, DEFAULT_DEV_ROLE, DEFAULT_TENANT_ID } from "@/lib/tenant";
import { ApiError } from "@/server/api/response";
import { hasModuleAccess } from "@/server/auth/roles";
import type { ModuleKey, TenantContext, UserRole } from "@/types/domain";

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function getTenantContext(req: NextRequest, moduleKey: ModuleKey): Promise<TenantContext> {
  const token = getBearerToken(req);

  if (ALLOW_DEV_AUTH_BYPASS) {
    const devRole = (req.headers.get("x-dev-role") as UserRole | null) || DEFAULT_DEV_ROLE;
    if (!hasModuleAccess(devRole, moduleKey)) {
      throw new ApiError(403, "Role has no permission for this module.");
    }
    return {
      tenantId: DEFAULT_TENANT_ID,
      uid: "dev-user",
      role: devRole,
      email: "dev@local"
    };
  }

  if (!token) {
    throw new ApiError(401, "Missing bearer token.");
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch {
    throw new ApiError(401, "Invalid or expired auth token.");
  }

  const role = (decoded.role as UserRole | undefined) || "viewer";
  const tenantId = (decoded.tenantId as string | undefined) || DEFAULT_TENANT_ID;

  if (!hasModuleAccess(role, moduleKey)) {
    throw new ApiError(403, "Role has no permission for this module.");
  }

  return {
    tenantId,
    uid: decoded.uid,
    role,
    email: decoded.email || null
  };
}
