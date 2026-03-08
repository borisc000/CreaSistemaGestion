import type { TenantCurrency } from "@/types/domain";

let runtimeCurrency: TenantCurrency = "CLP";
let runtimeLocale = "es-CL";

export function setCurrencyFormatContext(input: { currency?: TenantCurrency; locale?: string }) {
  runtimeCurrency = input.currency === "USD" ? "USD" : "CLP";
  if (typeof input.locale === "string" && input.locale.trim()) {
    runtimeLocale = input.locale;
  }
}

export function formatCurrency(value: number, options?: { currency?: TenantCurrency; locale?: string }): string {
  const currency = options?.currency === "USD" ? "USD" : options?.currency === "CLP" ? "CLP" : runtimeCurrency;
  const locale = options?.locale || runtimeLocale;
  const maximumFractionDigits = currency === "USD" ? 2 : 0;
  const minimumFractionDigits = currency === "USD" ? 2 : 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits
  }).format(value || 0);
}

export function formatDate(dateLike: string | null | undefined): string {
  if (!dateLike) return "-";
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(date);
}
