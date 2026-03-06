import type { NextRequest } from "next/server";
import { getTenantContext } from "@/server/auth/request-context";
import { jsonError, jsonOk } from "@/server/api/response";
import { computeDashboardKpis } from "@/server/services/dashboard";

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "dashboard");
    const data = await computeDashboardKpis(context.tenantId);
    return jsonOk({ data });
  } catch (error) {
    return jsonError(error);
  }
}