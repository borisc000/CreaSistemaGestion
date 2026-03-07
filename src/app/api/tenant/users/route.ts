import { z } from "zod";
import type { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { TENANT_MEMBER_ROLES, type TenantRole } from "@/lib/auth/roles";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { getTenantMembership, listTenantMemberships, upsertTenantMembership } from "@/server/tenancy/repository";
import { syncCustomClaimsForMembership } from "@/server/tenancy/service";
import { isPlatformAdmin } from "@/server/tenancy/access";
import type { AdminUserSummary, TenantUserMembership } from "@/types/domain";

const updateUserSchema = z.object({
  uid: z.string().min(3),
  role: z.string().min(2),
  tenantId: z.string().min(2).optional()
});

function parseTenantRoleOrThrow(role: string): TenantRole {
  if (!TENANT_MEMBER_ROLES.includes(role as TenantRole)) {
    throw new ApiError(400, "Rol invalido para usuarios del tenant.");
  }
  return role as TenantRole;
}

function resolveTargetTenantId(
  context: Awaited<ReturnType<typeof getTenantContext>>,
  requestedTenantId: string | null | undefined
): string {
  if (!requestedTenantId) {
    return context.tenantId;
  }

  if (isPlatformAdmin(context)) {
    return requestedTenantId;
  }

  if (requestedTenantId !== context.tenantId) {
    throw new ApiError(403, "No puedes operar usuarios de otro tenant.");
  }
  return requestedTenantId;
}

function filterMemberships(
  memberships: TenantUserMembership[],
  filters: { q?: string | null; role?: TenantRole | null; status?: string | null }
) {
  const q = filters.q?.trim().toLowerCase() || "";
  return memberships.filter((membership) => {
    if (filters.role && membership.role !== filters.role) return false;
    if (filters.status && membership.status !== filters.status) return false;
    if (!q) return true;
    return [membership.email, membership.uid].join(" ").toLowerCase().includes(q);
  });
}

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "admin_users", "read");
    const params = req.nextUrl.searchParams;
    const targetTenantId = resolveTargetTenantId(context, params.get("tenantId"));
    const roleFilter = params.get("role") ? parseTenantRoleOrThrow(params.get("role") as string) : null;
    const statusFilter = params.get("status");
    const q = params.get("q");

    const memberships = filterMemberships(await listTenantMemberships(targetTenantId), {
      q,
      role: roleFilter,
      status: statusFilter
    });

    const users = await Promise.all(
      memberships.map(async (membership): Promise<AdminUserSummary> => {
        let disabled = false;
        let displayName: string | null = null;
        let lastSignInTime: string | null = null;
        try {
          const user = await adminAuth.getUser(membership.uid);
          disabled = user.disabled;
          displayName = user.displayName || null;
          lastSignInTime = user.metadata.lastSignInTime || null;
        } catch {
          disabled = false;
        }

        return {
          uid: membership.uid,
          email: membership.email || null,
          displayName,
          disabled,
          lastSignInTime,
          role: membership.role,
          tenantId: membership.tenantId,
          status: membership.status
        };
      })
    );

    return jsonOk({ data: users });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "admin_users", "write");
    const parsed = updateUserSchema.parse(await req.json());
    const role = parseTenantRoleOrThrow(parsed.role);

    if (!isPlatformAdmin(context) && parsed.tenantId && parsed.tenantId !== context.tenantId) {
      throw new ApiError(403, "No puedes cambiar el tenant desde esta pantalla.");
    }

    const targetTenantId = resolveTargetTenantId(context, parsed.tenantId || null);
    const existing = await getTenantMembership(targetTenantId, parsed.uid);
    if (!existing) {
      throw new ApiError(404, "Usuario no encontrado en este tenant.");
    }

    const membership = await upsertTenantMembership({
      tenantId: existing.tenantId,
      uid: existing.uid,
      email: existing.email,
      role,
      status: existing.status,
      invitedByUid: existing.invitedByUid,
      acceptedAt: existing.acceptedAt
    });

    await syncCustomClaimsForMembership(existing.uid, membership, { preservePlatformRole: true });

    return jsonOk({
      ok: true,
      data: {
        uid: membership.uid,
        role: membership.role,
        tenantId: membership.tenantId
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}
