import { z } from "zod";
import type { NextRequest } from "next/server";
import { TENANT_MEMBER_ROLES, type TenantRole } from "@/lib/auth/roles";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { isPlatformAdmin } from "@/server/tenancy/access";
import {
  createTenantInvitation,
  getTenantById,
  getTenantInvitationById,
  listTenantInvitations,
  patchTenantInvitation
} from "@/server/tenancy/repository";
import {
  buildInvitationExpiryDate,
  buildTenantAccessUrl,
  ensureTenantCapacity,
  generateInvitationToken,
  getPreferredTenantHost,
  sendInvitationEmail
} from "@/server/tenancy/service";

const createInvitationSchema = z.object({
  email: z.string().email(),
  role: z.string().min(2),
  tenantId: z.string().min(2).optional()
});

const updateInvitationSchema = z.object({
  id: z.string().min(3),
  action: z.enum(["revoke", "resend"])
});

function parseTenantRole(role: string): TenantRole {
  if (!TENANT_MEMBER_ROLES.includes(role as TenantRole)) {
    throw new ApiError(400, "Rol invalido para invitaciones tenant.");
  }
  return role as TenantRole;
}

function resolveTargetTenantId(
  context: Awaited<ReturnType<typeof getTenantContext>>,
  requestedTenantId: string | null | undefined
): string {
  if (!requestedTenantId) return context.tenantId;
  if (isPlatformAdmin(context)) return requestedTenantId;
  if (requestedTenantId !== context.tenantId) {
    throw new ApiError(403, "No puedes invitar usuarios para otro tenant.");
  }
  return requestedTenantId;
}

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "admin_users", "read");
    const params = req.nextUrl.searchParams;
    const targetTenantId = resolveTargetTenantId(context, params.get("tenantId"));
    const status = params.get("status");
    const q = params.get("q")?.trim().toLowerCase() || "";

    const invitations = (await listTenantInvitations(targetTenantId)).filter((invitation) => {
      if (status && invitation.status !== status) return false;
      if (!q) return true;
      return invitation.email.toLowerCase().includes(q);
    });

    return jsonOk({ data: invitations });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "admin_users", "write");
    const parsed = createInvitationSchema.parse(await req.json());
    const role = parseTenantRole(parsed.role);
    const tenantId = resolveTargetTenantId(context, parsed.tenantId || null);
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      throw new ApiError(404, "Tenant no encontrado.");
    }
    if (tenant.status !== "active") {
      throw new ApiError(403, "Tenant suspendido. No se pueden enviar invitaciones.");
    }

    await ensureTenantCapacity(tenantId);
    const { token, tokenHash } = generateInvitationToken();
    const invitation = await createTenantInvitation({
      tenantId,
      email: parsed.email.toLowerCase(),
      role,
      expiresAt: buildInvitationExpiryDate(),
      invitedByUid: context.uid,
      tokenHash
    });

    const host = await getPreferredTenantHost(tenantId);
    const inviteUrl = buildTenantAccessUrl(host, token);
    let sent = false;
    try {
      const mailResult = await sendInvitationEmail({
        to: invitation.email,
        tenantName: tenant.name,
        role: invitation.role,
        inviteUrl
      });
      sent = mailResult.sent;
    } catch {
      sent = false;
    }

    return jsonOk(
      {
        data: invitation,
        inviteUrl,
        sent
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
    const context = await getTenantContext(req, "admin_users", "write");
    const parsed = updateInvitationSchema.parse(await req.json());
    const invitation = await getTenantInvitationById(parsed.id);
    if (!invitation) {
      throw new ApiError(404, "Invitacion no encontrada.");
    }

    if (!isPlatformAdmin(context) && invitation.tenantId !== context.tenantId) {
      throw new ApiError(403, "No puedes modificar invitaciones de otro tenant.");
    }

    if (parsed.action === "revoke") {
      await patchTenantInvitation(invitation.id, { status: "revoked" });
      return jsonOk({ ok: true });
    }

    const { token, tokenHash } = generateInvitationToken();
    const expiresAt = buildInvitationExpiryDate();
    await patchTenantInvitation(invitation.id, {
      status: "pending",
      tokenHash,
      expiresAt
    });

    const tenant = await getTenantById(invitation.tenantId);
    const host = await getPreferredTenantHost(invitation.tenantId);
    const inviteUrl = buildTenantAccessUrl(host, token);

    let sent = false;
    if (tenant) {
      try {
        const mailResult = await sendInvitationEmail({
          to: invitation.email,
          tenantName: tenant.name,
          role: invitation.role,
          inviteUrl
        });
        sent = mailResult.sent;
      } catch {
        sent = false;
      }
    }

    return jsonOk({ ok: true, inviteUrl, sent });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}
