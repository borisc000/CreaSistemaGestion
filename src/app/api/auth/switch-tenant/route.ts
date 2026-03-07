import { z } from "zod";
import type { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getAuthContext } from "@/server/auth/request-context";
import { getTenantById, getTenantMembership } from "@/server/tenancy/repository";
import { buildTenantAccessUrl, getPreferredTenantHost, syncCustomClaimsForMembership } from "@/server/tenancy/service";

const switchTenantSchema = z.object({
  tenantId: z.string().min(2)
});

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const parsed = switchTenantSchema.parse(await req.json());

    const membership = await getTenantMembership(parsed.tenantId, auth.uid);
    if (!membership || membership.status !== "active") {
      throw new ApiError(403, "No tienes membresia activa en ese tenant.");
    }

    const tenant = await getTenantById(parsed.tenantId);
    if (!tenant || tenant.status !== "active") {
      throw new ApiError(403, "El tenant seleccionado no esta disponible.");
    }

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
