export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value || 0);
}

export function formatDate(dateLike: string | null | undefined): string {
  if (!dateLike) return "-";
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(date);
}