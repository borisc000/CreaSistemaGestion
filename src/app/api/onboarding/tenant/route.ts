import { z } from "zod";
import type { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getAuthContext } from "@/server/auth/request-context";
import { buildTenantAccessUrl, getPreferredTenantHost, normalizeTenantSlug, onboardTenant } from "@/server/tenancy/service";

const onboardingSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(3).max(40).optional()
});

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    if (!auth.email) {
      throw new ApiError(400, "La cuenta autenticada no tiene email.");
    }

    const payload = onboardingSchema.parse(await req.json());
    const tenant = await onboardTenant({
      uid: auth.uid,
      email: auth.email,
      name: payload.name,
      slug: normalizeTenantSlug(payload.slug || payload.name, payload.name)
    });

    const host = await getPreferredTenantHost(tenant.id);
    return jsonOk(
      {
        data: {
          tenant,
          redirectUrl: buildTenantAccessUrl(host)
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
