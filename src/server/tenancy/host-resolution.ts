import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { getTenantBySlug, getTenantDomainByHost, isLocalHost, normalizeHost } from "@/server/tenancy/repository";

export const TENANT_BASE_DOMAIN =
  (process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN || process.env.TENANT_BASE_DOMAIN || "").trim().toLowerCase();

export function getRequestHost(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-host");
  const host = forwarded || headers.get("host");
  if (!host) return null;
  return normalizeHost(host);
}

function tryExtractTenantSlugFromHost(host: string): string | null {
  if (!TENANT_BASE_DOMAIN) return null;
  if (host === TENANT_BASE_DOMAIN) return null;
  if (!host.endsWith(`.${TENANT_BASE_DOMAIN}`)) return null;

  const prefix = host.slice(0, host.length - (`.${TENANT_BASE_DOMAIN}`).length);
  if (!prefix) return null;
  const segments = prefix.split(".");
  const slug = segments[segments.length - 1];
  return slug || null;
}

export async function resolveTenantIdForHost(host: string | null): Promise<string | null> {
  if (!host) {
    return DEFAULT_TENANT_ID;
  }

  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) {
    return DEFAULT_TENANT_ID;
  }

  if (isLocalHost(normalizedHost)) {
    return DEFAULT_TENANT_ID;
  }

  const directDomain = await getTenantDomainByHost(normalizedHost);
  if (directDomain && directDomain.status === "active" && (directDomain.verified || directDomain.type === "wildcard")) {
    return directDomain.tenantId;
  }

  const slug = tryExtractTenantSlugFromHost(normalizedHost);
  if (!slug) {
    return null;
  }

  const tenant = await getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return null;
  }
  return tenant.id;
}

export function assertCanUseHostFallback(host: string | null): boolean {
  if (!host) return true;
  return isLocalHost(host);
}
