import { Timestamp } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { computeChangedFields, resolveAuditActor } from "@/server/domain/audit";
import type { AuditLogEntry, UserRole } from "@/types/domain";

type EventType = AuditLogEntry["eventType"];

type AuditFilters = {
  module: string | null;
  eventType: EventType | null;
  actor: string | null;
  from: Date | null;
  to: Date | null;
};

function parseLimit(value: string | null): number {
  if (!value) return 25;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100) {
    throw new ApiError(400, "limit must be an integer between 1 and 100.");
  }
  return numeric;
}

function parseEventType(value: string | null): EventType | null {
  if (!value || value === "all") return null;
  if (value === "created" || value === "updated" || value === "deleted") return value;
  throw new ApiError(400, "eventType must be created, updated or deleted.");
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, "Invalid date filter.");
  }
  return date;
}

function toIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function serializeUnknown(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeUnknown(item));
  }
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(input).map(([key, nestedValue]) => [key, serializeUnknown(nestedValue)]));
  }
  return value;
}

function deriveEventType(before: Record<string, unknown> | null, after: Record<string, unknown> | null): EventType {
  if (!before && after) return "created";
  if (before && !after) return "deleted";
  return "updated";
}

function normalizeActor(value: unknown, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const fallback = resolveAuditActor(before, after);
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const actor = value as Record<string, unknown>;
  return {
    uid: typeof actor.uid === "string" ? actor.uid : fallback.uid,
    email: typeof actor.email === "string" ? actor.email : fallback.email,
    role: typeof actor.role === "string" ? (actor.role as UserRole) : fallback.role,
    source: actor.source === "user" ? "user" : fallback.source
  } as AuditLogEntry["actor"];
}

function matchesFilters(entry: AuditLogEntry, filters: AuditFilters): boolean {
  if (filters.module && entry.module !== filters.module) return false;
  if (filters.eventType && entry.eventType !== filters.eventType) return false;

  if (filters.from || filters.to) {
    const createdAtDate = new Date(entry.createdAt);
    if (filters.from && createdAtDate < filters.from) return false;
    if (filters.to && createdAtDate > filters.to) return false;
  }

  if (filters.actor) {
    const needle = filters.actor.toLowerCase();
    const haystack = [entry.actor.uid || "", entry.actor.email || "", entry.actor.role || ""].join(" ").toLowerCase();
    if (!haystack.includes(needle)) {
      return false;
    }
  }

  return true;
}

function normalizeAuditEntry(id: string, raw: Record<string, unknown>): AuditLogEntry {
  const before = (serializeUnknown(raw.before) as Record<string, unknown> | null) || null;
  const after = (serializeUnknown(raw.after) as Record<string, unknown> | null) || null;
  const changedFields = Array.isArray(raw.changedFields)
    ? raw.changedFields.filter((value): value is string => typeof value === "string").sort()
    : computeChangedFields(before, after);
  const eventType =
    raw.eventType === "created" || raw.eventType === "updated" || raw.eventType === "deleted"
      ? raw.eventType
      : deriveEventType(before, after);

  return {
    id,
    module: typeof raw.module === "string" ? raw.module : "unknown",
    collection: typeof raw.collection === "string" ? raw.collection : typeof raw.module === "string" ? raw.module : "unknown",
    entityId: typeof raw.entityId === "string" ? raw.entityId : id,
    eventType,
    createdAt: toIso(raw.createdAt),
    actor: normalizeActor(raw.actor, before, after),
    changedFields,
    before,
    after
  };
}

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "audit", "read");
    const params = req.nextUrl.searchParams;

    const limit = parseLimit(params.get("limit"));
    const cursor = params.get("cursor");
    const filters: AuditFilters = {
      module: params.get("module") && params.get("module") !== "all" ? params.get("module") : null,
      eventType: parseEventType(params.get("eventType")),
      actor: params.get("actor") || null,
      from: parseDate(params.get("from")),
      to: parseDate(params.get("to"))
    };

    const baseQuery = adminDb
      .collection("tenants")
      .doc(context.tenantId)
      .collection("auditLogs")
      .orderBy("createdAt", "desc");

    const scanBatch = Math.min(limit * 4, 200);
    const results: AuditLogEntry[] = [];
    let nextCursor: string | null = null;
    let cursorDoc = cursor
      ? await adminDb.collection("tenants").doc(context.tenantId).collection("auditLogs").doc(cursor).get()
      : null;
    let hasMore = false;

    for (let attempt = 0; attempt < 5 && results.length < limit; attempt += 1) {
      let query = baseQuery.limit(scanBatch);
      if (cursorDoc?.exists) {
        query = query.startAfter(cursorDoc);
      }

      const page = await query.get();
      if (page.empty) {
        hasMore = false;
        break;
      }

      for (const doc of page.docs) {
        const normalized = normalizeAuditEntry(doc.id, doc.data() as Record<string, unknown>);
        if (matchesFilters(normalized, filters)) {
          results.push(normalized);
          if (results.length >= limit) {
            break;
          }
        }
      }

      cursorDoc = page.docs[page.docs.length - 1] || null;
      hasMore = page.size === scanBatch;
      if (!hasMore) {
        break;
      }
    }

    if (hasMore && cursorDoc?.exists) {
      nextCursor = cursorDoc.id;
    }

    return jsonOk({
      data: results.slice(0, limit),
      cursor: nextCursor
    });
  } catch (error) {
    return jsonError(error);
  }
}
