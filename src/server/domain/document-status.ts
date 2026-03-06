import type { PersonDocumentStatus } from "@/types/domain";

export function deriveDocumentStatus(expiryDate: string | null | undefined, now = new Date()): PersonDocumentStatus {
  if (!expiryDate) return "uploaded";

  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) {
    return "uploaded";
  }

  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "expiring";
  return "uploaded";
}
