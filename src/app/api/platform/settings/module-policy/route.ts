import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/server/api/response";
import {
  assertValidModulePolicyPayload,
  getModulePolicySnapshot,
  patchModulePolicySnapshot
} from "@/server/auth/module-policy";
import { getTenantContext } from "@/server/auth/request-context";
import { assertPlatformAdmin } from "@/server/tenancy/access";

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "platform", "read");
    assertPlatformAdmin(context);
    const policy = await getModulePolicySnapshot();
    return jsonOk({ data: policy });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "platform", "write");
    assertPlatformAdmin(context);
    const payload = await req.json();
    assertValidModulePolicyPayload(payload);
    const updated = await patchModulePolicySnapshot({
      modules: payload.modules,
      actorUid: context.uid
    });
    return jsonOk({ ok: true, data: updated });
  } catch (error) {
    return jsonError(error);
  }
}
