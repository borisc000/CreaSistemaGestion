import { z } from "zod";
import type { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { jsonError, jsonOk, ApiError } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { filterAdminUsers, normalizeAdminUser } from "@/server/domain/admin-users";
import { USER_ROLES } from "@/types/auth";
import type { UserRole } from "@/types/domain";

const updateClaimsSchema = z.object({
  uid: z.string().min(3),
  role: z.enum(USER_ROLES),
  tenantId: z.string().min(2).optional()
});

function parseLimit(value: string | null): number {
  if (!value) return 25;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100) {
    throw new ApiError(400, "limit must be an integer between 1 and 100.");
  }
  return numeric;
}

function parseRole(value: string | null): UserRole | null {
  if (!value || value === "all") return null;
  if (!USER_ROLES.includes(value as UserRole)) {
    throw new ApiError(400, "Invalid role filter.");
  }
  return value as UserRole;
}

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "admin_users", "read");
    const params = req.nextUrl.searchParams;
    const limit = parseLimit(params.get("limit"));
    const pageToken = params.get("pageToken") || undefined;
    const q = params.get("q");
    const role = parseRole(params.get("role"));
    const tenantId = params.get("tenantId") || context.tenantId;

    const page = await adminAuth.listUsers(limit, pageToken);
    const users = page.users.map(normalizeAdminUser);
    const filtered = filterAdminUsers(users, { q, role, tenantId });

    return jsonOk({
      data: filtered,
      pageToken: page.pageToken || null
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "admin_users", "write");
    if (context.role !== "admin") {
      throw new ApiError(403, "Only admin role can update user claims.");
    }

    const parsed = updateClaimsSchema.parse(await req.json());
    const targetUser = await adminAuth.getUser(parsed.uid);
    const tenantId = parsed.tenantId || context.tenantId || DEFAULT_TENANT_ID;

    await adminAuth.setCustomUserClaims(parsed.uid, {
      ...(targetUser.customClaims || {}),
      role: parsed.role,
      tenantId
    });

    return jsonOk({
      ok: true,
      data: {
        uid: parsed.uid,
        role: parsed.role,
        tenantId
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}
