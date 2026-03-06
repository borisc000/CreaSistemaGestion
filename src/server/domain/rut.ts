const PENDING_PREFIX = "PENDING-";

function computeVerifierDigit(body: string): string {
  let sum = 0;
  let multiplier = 2;

  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  if (remainder === 11) return "0";
  if (remainder === 10) return "K";
  return String(remainder);
}

function normalizeBody(body: string): string {
  const trimmed = body.replace(/^0+/, "");
  return trimmed || "0";
}

export function isPendingIdNumber(value: string): boolean {
  return value.trim().toUpperCase().startsWith(PENDING_PREFIX);
}

export function normalizeRut(value: string): string {
  const sanitized = value.trim().toUpperCase().replace(/[^0-9K]/g, "");
  if (sanitized.length < 2) {
    throw new Error("RUT invalido.");
  }

  const rawBody = sanitized.slice(0, -1);
  const verifier = sanitized.slice(-1);
  if (!/^\d+$/.test(rawBody)) {
    throw new Error("RUT invalido.");
  }

  const body = normalizeBody(rawBody);
  const expectedVerifier = computeVerifierDigit(body);
  if (verifier !== expectedVerifier) {
    throw new Error("RUT invalido.");
  }

  return `${body}-${verifier}`;
}

export function tryNormalizeRut(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isPendingIdNumber(value)) return null;

  try {
    return normalizeRut(value);
  } catch {
    return null;
  }
}
