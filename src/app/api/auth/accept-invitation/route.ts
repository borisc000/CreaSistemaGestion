import { z } from "zod";
import type { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getAuthContext } from "@/server/auth/request-context";
import {
  getTenantById,
  getTenantInvitationByTokenHash,
  patchTenantInvitation,
  upsertTenantMembership
} from "@/server/tenancy/repository";
import {
  buildTenantAccessUrl,
  getPreferredTenantHost,
  hashInvitationToken,
  syncCustomClaimsForMembership
} from "@/server/tenancy/service";

const acceptInvitationSchema = z.object({
  token: z.string().min(12)
});

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    if (!auth.email) {
      throw new ApiError(400, "La cuenta autenticada no tiene email.");
    }

    const parsed = acceptInvitationSchema.parse(await req.json());
    const invitation = await getTenantInvitationByTokenHash(hashInvitationToken(parsed.token));
    if (!invitation) {
      throw new ApiError(404, "Invitacion invalida o ya utilizada.");
    }

    if (invitation.status !== "pending") {
      throw new ApiError(409, "La invitacion ya no esta disponible.");
    }

    if (new Date(invitation.expiresAt).getTime() < Date.now()) {
      await patchTenantInvitation(invitation.id, { status: "expired" });
      throw new ApiError(410, "La invitacion ha expirado.");
    }

    if (invitation.email.toLowerCase() !== auth.email.toLowerCase()) {
      throw new ApiError(403, "El email autenticado no coincide con la invitacion.");
    }

    const tenant = await getTenantById(invitation.tenantId);
    if (!tenant || tenant.status !== "active") {
      throw new ApiError(403, "El tenant asociado esta inactivo.");
    }

    const acceptedAt = new Date().toISOString();
    const membership = await upsertTenantMembership({
      tenantId: invitation.tenantId,
      uid: auth.uid,
      email: auth.email,
      role: invitation.role,
      status: "active",
      invitedByUid: invitation.invitedByUid || null,
      acceptedAt
    });

    await patchTenantInvitation(invitation.id, {
      status: "accepted",
      acceptedAt,
      acceptedByUid: auth.uid
    });

    await syncCustomClaimsForMembership(auth.uid, membership, { preservePlatformRole: true });
    const host = await getPreferredTenantHost(tenant.id);

    return jsonOk({
      data: {
        tenant,
        membership,
        redirectUrl: buildTenantAccessUrl(host)
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}
