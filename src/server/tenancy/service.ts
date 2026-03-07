import { createHash, randomBytes } from "node:crypto";
import { adminAuth } from "@/lib/firebase/admin";
import { ApiError } from "@/server/api/response";
import { buildTenantPlan } from "@/server/tenancy/plans";
import {
  countTenantMembersForLimit,
  createTenant,
  getTenantById,
  getTenantBySlug,
  listTenantDomains,
  nowIso,
  upsertTenantDomain,
  upsertTenantMembership
} from "@/server/tenancy/repository";
import type { BillingPlanCode, ModuleKey, TenantRecord, TenantUserMembership } from "@/types/domain";
import type { TenantRole } from "@/lib/auth/roles";

const INVITATION_EXPIRY_DAYS = Number(process.env.INVITATION_EXPIRY_DAYS || 7);
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "Sistema Gestion <no-reply@sistemagestioncrea.app>";
const APP_PUBLIC_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const TENANT_BASE_DOMAIN =
  (process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN || process.env.TENANT_BASE_DOMAIN || "").trim().toLowerCase();

function slugifyTenantName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function normalizeTenantSlug(rawSlug: string, fallbackName?: string): string {
  const base = rawSlug.trim().toLowerCase() || (fallbackName ? slugifyTenantName(fallbackName) : "");
  const normalized = base.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(normalized)) {
    throw new ApiError(400, "Slug invalido. Usa 3-40 caracteres [a-z0-9-] sin guiones al inicio/fin.");
  }
  return normalized;
}

export function generateInvitationToken() {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function buildInvitationExpiryDate(days = INVITATION_EXPIRY_DAYS): string {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Math.max(1, days));
  return expiresAt.toISOString();
}

export async function syncCustomClaimsForMembership(
  uid: string,
  membership: Pick<TenantUserMembership, "tenantId" | "role">,
  options?: { preservePlatformRole?: boolean }
) {
  const user = await adminAuth.getUser(uid);
  const existingClaims = user.customClaims || {};
  const platformRole = options?.preservePlatformRole && existingClaims.platformRole === "platform_admin" ? "platform_admin" : null;

  await adminAuth.setCustomUserClaims(uid, {
    ...existingClaims,
    role: membership.role,
    tenantRole: membership.role,
    tenantId: membership.tenantId,
    platformRole
  });
}

export async function syncPlatformAdminClaims(uid: string, tenantId: string | null) {
  const user = await adminAuth.getUser(uid);
  const existingClaims = user.customClaims || {};
  await adminAuth.setCustomUserClaims(uid, {
    ...existingClaims,
    role: tenantId ? "tenant_admin" : "platform_admin",
    tenantRole: tenantId ? "tenant_admin" : null,
    tenantId: tenantId || existingClaims.tenantId || null,
    platformRole: "platform_admin"
  });
}

export async function ensureTenantCapacity(tenantId: string): Promise<void> {
  const [tenant, currentUsers] = await Promise.all([getTenantById(tenantId), countTenantMembersForLimit(tenantId)]);
  if (!tenant) {
    throw new ApiError(404, "Tenant no encontrado.");
  }

  if (tenant.plan.status !== "active") {
    throw new ApiError(403, "El plan del tenant no esta activo.");
  }

  if (currentUsers >= tenant.plan.limits.maxUsers) {
    throw new ApiError(409, `Se alcanzo el limite de usuarios (${tenant.plan.limits.maxUsers}) para este plan.`);
  }
}

type OnboardTenantInput = {
  uid: string;
  email: string;
  name: string;
  slug: string;
  planCode?: BillingPlanCode;
};

export async function onboardTenant(input: OnboardTenantInput): Promise<TenantRecord> {
  const normalizedSlug = normalizeTenantSlug(input.slug, input.name);
  const existing = await getTenantBySlug(normalizedSlug);
  if (existing) {
    throw new ApiError(409, "Ese slug ya esta en uso.");
  }

  const tenant = await createTenant({
    id: normalizedSlug,
    name: input.name.trim(),
    slug: normalizedSlug,
    status: "active",
    plan: buildTenantPlan(input.planCode || "starter"),
    ownerUserId: input.uid
  });

  const membership = await upsertTenantMembership({
    tenantId: tenant.id,
    uid: input.uid,
    email: input.email,
    role: "tenant_admin",
    status: "active",
    invitedByUid: null,
    acceptedAt: nowIso()
  });
  await syncCustomClaimsForMembership(input.uid, membership, { preservePlatformRole: true });

  if (TENANT_BASE_DOMAIN) {
    await upsertTenantDomain({
      host: `${tenant.slug}.${TENANT_BASE_DOMAIN}`,
      tenantId: tenant.id,
      type: "wildcard",
      verified: true,
      status: "active"
    });
  }

  return tenant;
}

export async function getPreferredTenantHost(tenantId: string): Promise<string | null> {
  const domains = await listTenantDomains(tenantId);
  const active = domains.filter((domain) => domain.status === "active");
  const wildcard = active.find((domain) => domain.type === "wildcard");
  const custom = active.find((domain) => domain.type === "custom" && domain.verified);
  return custom?.host || wildcard?.host || null;
}

export function buildTenantAccessUrl(host: string | null, invitationToken?: string): string {
  if (!host) {
    return invitationToken
      ? `${APP_PUBLIC_URL}/invitacion/aceptar?token=${encodeURIComponent(invitationToken)}`
      : `${APP_PUBLIC_URL}/dashboard`;
  }

  const protocol = host.includes("localhost") ? "http" : "https";
  if (invitationToken) {
    return `${protocol}://${host}/invitacion/aceptar?token=${encodeURIComponent(invitationToken)}`;
  }
  return `${protocol}://${host}/dashboard`;
}

type SendInvitationEmailInput = {
  to: string;
  tenantName: string;
  role: TenantRole;
  inviteUrl: string;
};

export async function sendInvitationEmail(input: SendInvitationEmailInput): Promise<{ sent: boolean; providerId: string | null }> {
  if (!RESEND_API_KEY) {
    return { sent: false, providerId: null };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [input.to],
      subject: `Invitacion a ${input.tenantName}`,
      html: `<p>Fuiste invitado a <strong>${input.tenantName}</strong> con rol <strong>${input.role}</strong>.</p>
<p><a href="${input.inviteUrl}">Aceptar invitacion</a></p>
<p>Si no esperabas este correo, ignora este mensaje.</p>`
    })
  });

  if (!response.ok) {
    throw new ApiError(502, "No se pudo enviar invitacion por email.");
  }

  const payload = (await response.json().catch(() => ({}))) as { id?: string };
  return { sent: true, providerId: payload.id || null };
}

export function isModuleEnabledForPlan(moduleKey: ModuleKey, tenant: TenantRecord | null): boolean {
  if (!tenant) return false;
  return tenant.plan.limits.enabledModules.includes(moduleKey);
}
