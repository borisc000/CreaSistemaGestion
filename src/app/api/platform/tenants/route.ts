import { z } from "zod";
import type { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { TENANT_MEMBER_ROLES, type TenantRole } from "@/lib/auth/roles";
import { MODULE_KEYS } from "@/modules/registry";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { assertPlatformAdmin } from "@/server/tenancy/access";
import { buildTenantPlan } from "@/server/tenancy/plans";
import {
  createTenant,
  deleteTenantHard,
  getTenantById,
  listTenants,
  patchTenant,
  upsertTenantDomain,
  upsertTenantMembership
} from "@/server/tenancy/repository";
import { normalizeTenantSlug, syncCustomClaimsForMembership } from "@/server/tenancy/service";
import type { BillingPlanCode, ModuleKey, TenantStatus } from "@/types/domain";

const createTenantSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(3).max(40),
  planCode: z.enum(["starter", "pro", "enterprise"]).optional(),
  ownerEmail: z.string().email(),
  ownerRole: z.string().min(2).optional()
});

const patchTenantSchema = z.object({
  id: z.string().min(2),
  status: z.enum(["active", "suspended"]).optional(),
  planCode: z.enum(["starter", "pro", "enterprise"]).optional(),
  maxUsers: z.number().int().positive().optional(),
  enabledModules: z.array(z.string().min(2)).optional(),
  action: z.enum(["assign_user", "delete"]).optional(),
  email: z.string().email().optional(),
  role: z.string().min(2).optional(),
  confirmSlug: z.string().min(2).optional()
});

const TENANT_BASE_DOMAIN =
  (process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN || process.env.TENANT_BASE_DOMAIN || "").trim().toLowerCase();

function parseStatus(value: string | null): TenantStatus | undefined {
  if (!value) return undefined;
  if (value === "active" || value === "suspended") return value;
  throw new ApiError(400, "status invalido.");
}

function parseEnabledModules(raw: string[] | undefined): ModuleKey[] | undefined {
  if (!raw) return undefined;
  const all = new Set<ModuleKey>(MODULE_KEYS.filter((moduleKey) => moduleKey !== "platform"));
  const parsed = raw.filter((moduleKey): moduleKey is ModuleKey => all.has(moduleKey as ModuleKey));
  if (parsed.length !== raw.length) {
    throw new ApiError(400, "enabledModules contiene modulos no validos.");
  }
  return parsed;
}

function parseTenantRoleOrThrow(value: string): TenantRole {
  if (!TENANT_MEMBER_ROLES.includes(value as TenantRole)) {
    throw new ApiError(400, "Rol invalido para membresia de tenant.");
  }
  return value as TenantRole;
}

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "platform", "read");
    assertPlatformAdmin(context);

    const q = req.nextUrl.searchParams.get("q") || undefined;
    const status = parseStatus(req.nextUrl.searchParams.get("status"));
    const data = await listTenants({ q, status });
    return jsonOk({ data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "platform", "write");
    assertPlatformAdmin(context);
    const parsed = createTenantSchema.parse(await req.json());

    const slug = normalizeTenantSlug(parsed.slug, parsed.name);
    const ownerRole = parseTenantRoleOrThrow(parsed.ownerRole || "tenant_admin");
    const existing = await getTenantById(slug);
    if (existing) {
      throw new ApiError(409, "Ya existe un tenant con ese slug.");
    }

    const tenant = await createTenant({
      id: slug,
      name: parsed.name.trim(),
      slug,
      status: "active",
      plan: buildTenantPlan(parsed.planCode || "starter"),
      ownerUserId: null
    });

    if (TENANT_BASE_DOMAIN) {
      await upsertTenantDomain({
        host: `${tenant.slug}.${TENANT_BASE_DOMAIN}`,
        tenantId: tenant.id,
        type: "wildcard",
        verified: true,
        status: "active"
      });
    }

    let ownerUid: string | null = null;
    const owner = await adminAuth.getUserByEmail(parsed.ownerEmail);
    ownerUid = owner.uid;
    const membership = await upsertTenantMembership({
      tenantId: tenant.id,
      uid: owner.uid,
      email: parsed.ownerEmail,
      role: ownerRole,
      status: "active",
      invitedByUid: context.uid,
      acceptedAt: new Date().toISOString()
    });
    await syncCustomClaimsForMembership(owner.uid, membership, { preservePlatformRole: true });
    await patchTenant(tenant.id, { ownerUserId: owner.uid });

    return jsonOk(
      {
        data: {
          ...tenant,
          ownerUserId: ownerUid,
          ownerRole
        }
      },
      201
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "platform", "write");
    assertPlatformAdmin(context);
    const parsed = patchTenantSchema.parse(await req.json());

    const tenant = await getTenantById(parsed.id);
    if (!tenant) {
      throw new ApiError(404, "Tenant no encontrado.");
    }

    if (parsed.action === "assign_user") {
      if (!parsed.email) {
        throw new ApiError(400, "email es requerido para asignar usuario.");
      }

      const role = parseTenantRoleOrThrow(parsed.role || "viewer");
      let targetUser;
      try {
        targetUser = await adminAuth.getUserByEmail(parsed.email);
      } catch {
        throw new ApiError(404, "El correo no existe en Auth. Debe iniciar sesion una vez primero.");
      }

      const membership = await upsertTenantMembership({
        tenantId: tenant.id,
        uid: targetUser.uid,
        email: parsed.email,
        role,
        status: "active",
        invitedByUid: context.uid,
        acceptedAt: new Date().toISOString()
      });
      await syncCustomClaimsForMembership(targetUser.uid, membership, { preservePlatformRole: true });

      if (role === "tenant_admin" && tenant.ownerUserId !== targetUser.uid) {
        await patchTenant(tenant.id, { ownerUserId: targetUser.uid });
      }

      return jsonOk({
        ok: true,
        data: {
          tenantId: tenant.id,
          uid: targetUser.uid,
          email: parsed.email.toLowerCase(),
          role
        }
      });
    }

    if (parsed.action === "delete") {
      if (tenant.status !== "suspended") {
        throw new ApiError(409, "Para eliminar, primero debes suspender el tenant.");
      }
      if (!parsed.confirmSlug || parsed.confirmSlug !== tenant.slug) {
        throw new ApiError(400, `Confirmacion invalida. Debes escribir el slug exacto: ${tenant.slug}`);
      }

      const deleted = await deleteTenantHard(tenant.id);
      return jsonOk({
        ok: true,
        data: {
          tenantId: tenant.id,
          ...deleted
        }
      });
    }

    const nextPlanCode = parsed.planCode || tenant.plan.code;
    const nextPlan = buildTenantPlan(nextPlanCode as BillingPlanCode);
    if (typeof parsed.maxUsers === "number") {
      nextPlan.limits.maxUsers = parsed.maxUsers;
    }

    const enabledModules = parseEnabledModules(parsed.enabledModules);
    if (enabledModules) {
      nextPlan.limits.enabledModules = enabledModules;
    } else {
      nextPlan.limits.enabledModules = tenant.plan.limits.enabledModules;
    }

    await patchTenant(parsed.id, {
      status: parsed.status || tenant.status,
      plan: {
        ...nextPlan,
        status: tenant.plan.status
      }
    });

    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}
