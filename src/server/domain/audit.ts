import type { UserRole } from "@/types/domain";

type JsonLike = Record<string, unknown> | null;

const AUDIT_IGNORED_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "updatedByUid",
  "updatedByEmail",
  "updatedByRole"
]);

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return false;

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!deepEqual(left[index], right[index])) return false;
    }
    return true;
  }

  if (typeof left === "object" && typeof right === "object") {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
    for (const key of keys) {
      if (!deepEqual(leftRecord[key], rightRecord[key])) return false;
    }
    return true;
  }

  return false;
}

export function computeChangedFields(before: JsonLike, after: JsonLike): string[] {
  const keys = new Set<string>([
    ...Object.keys(before || {}),
    ...Object.keys(after || {})
  ]);

  return Array.from(keys)
    .filter((field) => !AUDIT_IGNORED_FIELDS.has(field))
    .filter((field) => !deepEqual(before?.[field], after?.[field]))
    .sort();
}

export type AuditActor = {
  uid: string | null;
  email: string | null;
  role: UserRole | null;
  source: "user" | "system";
};

export function resolveAuditActor(before: JsonLike, after: JsonLike): AuditActor {
  const uid = (after?.updatedByUid as string | undefined) || (before?.updatedByUid as string | undefined) || null;
  const email = (after?.updatedByEmail as string | undefined) || (before?.updatedByEmail as string | undefined) || null;
  const role = (after?.updatedByRole as UserRole | undefined) || (before?.updatedByRole as UserRole | undefined) || null;

  if (!uid && !email && !role) {
    return {
      uid: null,
      email: null,
      role: null,
      source: "system"
    };
  }

  return {
    uid,
    email,
    role,
    source: "user"
  };
}
