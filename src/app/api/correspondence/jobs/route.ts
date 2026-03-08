import type { NextRequest } from "next/server";
import { getTenantContext } from "@/server/auth/request-context";
import { jsonError, jsonOk } from "@/server/api/response";
import { listEntities } from "@/server/repositories/firestore-repository";

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "correspondencia_cruzada", "read");
    const data = await listEntities(context.tenantId, "correspondenceJobs");
    return jsonOk({ data });
  } catch (error) {
    return jsonError(error);
  }
}

