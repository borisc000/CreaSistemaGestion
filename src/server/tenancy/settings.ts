import type { TenantCurrency, TenantRecord, TenantSettings } from "@/types/domain";

export const TENANT_CURRENCIES: TenantCurrency[] = ["CLP", "USD"];

export function parseTenantCurrency(value: unknown): TenantCurrency {
  return value === "USD" ? "USD" : "CLP";
}

export function resolveTenantSettings(tenant: TenantRecord | null): TenantSettings {
  const currency = parseTenantCurrency(tenant?.settings?.company?.currency);
  return {
    company: {
      currency
    }
  };
}

export function mergeTenantSettings(
  current: Partial<TenantSettings> | undefined,
  patch: Partial<TenantSettings>
): Partial<TenantSettings> {
  const mergedCurrency = parseTenantCurrency(patch.company?.currency ?? current?.company?.currency);
  return {
    ...current,
    ...patch,
    company: {
      currency: mergedCurrency
    }
  };
}
