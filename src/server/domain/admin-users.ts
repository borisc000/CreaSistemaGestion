import type { UserRecord } from "firebase-admin/auth";
import { parseTenantRole, type TenantRole } from "@/lib/auth/roles";
import type { AdminUserSummary } from "@/types/domain";

function parseRole(value: unknown): TenantRole {
  return parseTenantRole(value);
}

export function normalizeAdminUser(user: UserRecord): AdminUserSummary {
  return {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || null,
    disabled: user.disabled,
    lastSignInTime: user.metadata.lastSignInTime || null,
    role: parseRole(user.customClaims?.role),
    tenantId: typeof user.customClaims?.tenantId === "string" ? user.customClaims.tenantId : null
  };
}

type AdminUserFilters = {
  q?: string | null;
  role?: TenantRole | null;
  tenantId?: string | null;
};

export function filterAdminUsers(users: AdminUserSummary[], filters: AdminUserFilters): AdminUserSummary[] {
  const normalizedQuery = filters.q?.trim().toLowerCase() || "";

  return users.filter((user) => {
    if (filters.role && user.role !== filters.role) {
      return false;
    }

    if (typeof filters.tenantId === "string" && filters.tenantId.length > 0 && user.tenantId !== filters.tenantId) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = [user.email || "", user.displayName || "", user.uid].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}
