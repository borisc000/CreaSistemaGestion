import { adminDb } from "@/lib/firebase/admin";
import { MODULE_KEYS, getModuleDefinition, type ModuleKey } from "@/modules/registry";
import { ApiError } from "@/server/api/response";
import type { UserRole } from "@/types/auth";
import { USER_ROLES } from "@/types/auth";
import type { TenantRecord } from "@/types/domain";

const PLATFORM_SETTINGS_COLLECTION = "platformSettings";
const MODULE_POLICY_DOC_ID = "modulePolicy";
const LOCKED_PLATFORM_MODULE_KEY: ModuleKey = "platform";

type RoleActionAccess = {
  read: boolean;
  write: boolean;
};

export type ModulePolicyMatrix = Record<ModuleKey, Record<UserRole, RoleActionAccess>>;

export type ModulePolicySnapshot = {
  modules: ModulePolicyMatrix;
  updatedAt: string | null;
  updatedByUid: string | null;
};

type RawModulePolicy = {
  modules?: Record<string, Record<string, Partial<RoleActionAccess>>>;
  updatedAt?: unknown;
  updatedByUid?: unknown;
};

function policyDocRef() {
  return adminDb.collection(PLATFORM_SETTINGS_COLLECTION).doc(MODULE_POLICY_DOC_ID);
}

function staticModuleRoleAccess(moduleKey: ModuleKey, role: UserRole): RoleActionAccess {
  const staticAccess = getModuleDefinition(moduleKey).accessPolicy[role];
  return {
    read: Boolean(staticAccess?.read),
    write: Boolean(staticAccess?.write)
  };
}

function buildModuleMatrix(
  resolver: (moduleKey: ModuleKey, role: UserRole, staticAccess: RoleActionAccess) => RoleActionAccess
): ModulePolicyMatrix {
  const matrix = {} as ModulePolicyMatrix;
  for (const moduleKey of MODULE_KEYS) {
    const roleMatrix = {} as Record<UserRole, RoleActionAccess>;
    for (const role of USER_ROLES) {
      const staticAccess = staticModuleRoleAccess(moduleKey, role);
      const resolved = resolver(moduleKey, role, staticAccess);
      const read = resolved.read && staticAccess.read;
      const write = resolved.write && staticAccess.write && read;
      roleMatrix[role] = { read, write };
    }
    matrix[moduleKey] = roleMatrix;
  }
  return matrix;
}

export function buildDefaultModulePolicyMatrix(): ModulePolicyMatrix {
  return buildModuleMatrix((_moduleKey, _role, staticAccess) => staticAccess);
}

export function normalizeModulePolicy(raw: unknown): ModulePolicySnapshot {
  const payload = (raw || {}) as RawModulePolicy;
  const matrix = buildModuleMatrix((moduleKey, role, staticAccess) => {
    const candidate = payload.modules?.[moduleKey]?.[role];
    if (!candidate) {
      return staticAccess;
    }
    return {
      read: typeof candidate.read === "boolean" ? candidate.read : staticAccess.read,
      write: typeof candidate.write === "boolean" ? candidate.write : staticAccess.write
    };
  });

  // Anti-lock: platform_admin must always control platform policy endpoints.
  matrix[LOCKED_PLATFORM_MODULE_KEY].platform_admin = {
    read: true,
    write: true
  };

  return {
    modules: matrix,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : null,
    updatedByUid: typeof payload.updatedByUid === "string" ? payload.updatedByUid : null
  };
}

export async function getModulePolicySnapshot(): Promise<ModulePolicySnapshot> {
  const snapshot = await policyDocRef().get();
  if (!snapshot.exists) {
    return {
      modules: buildDefaultModulePolicyMatrix(),
      updatedAt: null,
      updatedByUid: null
    };
  }
  return normalizeModulePolicy(snapshot.data() || {});
}

export async function patchModulePolicySnapshot(input: {
  modules: unknown;
  actorUid: string;
}): Promise<ModulePolicySnapshot> {
  const next = normalizeModulePolicy({ modules: input.modules });
  const now = new Date().toISOString();
  await policyDocRef().set(
    {
      modules: next.modules,
      updatedAt: now,
      updatedByUid: input.actorUid
    },
    { merge: true }
  );
  return {
    modules: next.modules,
    updatedAt: now,
    updatedByUid: input.actorUid
  };
}

export function isModuleEnabledForTenant(moduleKey: ModuleKey, tenant: TenantRecord | null): boolean {
  if (moduleKey === "platform") {
    return true;
  }
  if (!tenant) {
    return false;
  }
  if (moduleKey === "dashboard") {
    return true;
  }
  return tenant.plan.limits.enabledModules.includes(moduleKey);
}

export function resolveModuleActionAccess(input: {
  moduleKey: ModuleKey;
  role: UserRole;
  action: "read" | "write";
  tenant: TenantRecord | null;
  policy: ModulePolicySnapshot;
}): boolean {
  const staticAccess = staticModuleRoleAccess(input.moduleKey, input.role);
  const policyAccess = input.policy.modules[input.moduleKey]?.[input.role] || staticAccess;
  const enabledForTenant = isModuleEnabledForTenant(input.moduleKey, input.tenant);
  return staticAccess[input.action] && policyAccess[input.action] && enabledForTenant;
}

export function resolveModuleAccessSnapshot(input: {
  moduleKey: ModuleKey;
  role: UserRole;
  tenant: TenantRecord | null;
  policy: ModulePolicySnapshot;
}): { read: boolean; write: boolean; enabledForTenant: boolean } {
  return {
    read: resolveModuleActionAccess({ ...input, action: "read" }),
    write: resolveModuleActionAccess({ ...input, action: "write" }),
    enabledForTenant: isModuleEnabledForTenant(input.moduleKey, input.tenant)
  };
}

export function resolveAllModuleAccess(input: {
  role: UserRole;
  tenant: TenantRecord | null;
  policy: ModulePolicySnapshot;
}): Record<ModuleKey, { read: boolean; write: boolean; enabledForTenant: boolean }> {
  const result = {} as Record<ModuleKey, { read: boolean; write: boolean; enabledForTenant: boolean }>;
  for (const moduleKey of MODULE_KEYS) {
    result[moduleKey] = resolveModuleAccessSnapshot({
      moduleKey,
      role: input.role,
      tenant: input.tenant,
      policy: input.policy
    });
  }
  return result;
}

export function assertValidModulePolicyPayload(payload: unknown): asserts payload is { modules: unknown } {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(400, "Invalid policy payload.");
  }
  if (!("modules" in payload)) {
    throw new ApiError(400, "modules is required.");
  }

  const modules = (payload as { modules: unknown }).modules;
  if (!modules || typeof modules !== "object" || Array.isArray(modules)) {
    throw new ApiError(400, "modules must be an object.");
  }

  for (const [moduleKey, roleMap] of Object.entries(modules as Record<string, unknown>)) {
    if (!(MODULE_KEYS as readonly string[]).includes(moduleKey)) {
      throw new ApiError(400, `Invalid module key: ${moduleKey}`);
    }
    if (!roleMap || typeof roleMap !== "object" || Array.isArray(roleMap)) {
      throw new ApiError(400, `Invalid role policy for module: ${moduleKey}`);
    }
    for (const [role, access] of Object.entries(roleMap as Record<string, unknown>)) {
      if (!(USER_ROLES as readonly string[]).includes(role)) {
        throw new ApiError(400, `Invalid role in policy: ${role}`);
      }
      if (!access || typeof access !== "object" || Array.isArray(access)) {
        throw new ApiError(400, `Invalid access object for module ${moduleKey}, role ${role}`);
      }
      const read = (access as { read?: unknown }).read;
      const write = (access as { write?: unknown }).write;
      if (read !== undefined && typeof read !== "boolean") {
        throw new ApiError(400, `Invalid read flag for module ${moduleKey}, role ${role}`);
      }
      if (write !== undefined && typeof write !== "boolean") {
        throw new ApiError(400, `Invalid write flag for module ${moduleKey}, role ${role}`);
      }
    }
  }
}
