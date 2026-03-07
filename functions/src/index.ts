import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";

initializeApp();
setGlobalOptions({
  region: "southamerica-west1",
  maxInstances: 10
});

const db = getFirestore();
const auth = getAuth();

const USER_ROLES = [
  "platform_admin",
  "tenant_admin",
  "tenant_manager",
  "tender_lead",
  "contract_manager",
  "finance",
  "hr",
  "viewer"
] as const;
type UserRole = (typeof USER_ROLES)[number];

function deriveDocumentStatus(expiryDate: string | null | undefined, now = new Date()) {
  if (!expiryDate) return "uploaded";

  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return "uploaded";

  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "expiring";
  return "uploaded";
}

function getTenantIdFromPath(path: string): string | null {
  const segments = path.split("/");
  const tenantsIndex = segments.indexOf("tenants");
  if (tenantsIndex === -1 || tenantsIndex + 1 >= segments.length) {
    return null;
  }
  return segments[tenantsIndex + 1] || null;
}

export const syncDocumentStatuses = onSchedule(
  {
    schedule: "every day 06:00",
    timeZone: "America/Santiago"
  },
  async () => {
    const snapshot = await db.collectionGroup("personDocuments").get();
    const now = new Date();
    let updated = 0;

    for (const document of snapshot.docs) {
      const data = document.data() as { expiryDate?: string | null; status?: string; personId?: string; docType?: string };
      const nextStatus = deriveDocumentStatus(data.expiryDate, now);

      if (data.status !== nextStatus) {
        await document.ref.set(
          {
            status: nextStatus,
            updatedAt: now.toISOString()
          },
          { merge: true }
        );
        updated += 1;
      }

      if (nextStatus === "expiring" || nextStatus === "expired") {
        const tenantId = getTenantIdFromPath(document.ref.path);
        if (!tenantId) continue;

        await db
          .collection("tenants")
          .doc(tenantId)
          .collection("alerts")
          .doc(`${document.id}-${nextStatus}`)
          .set(
            {
              type: "document_expiry",
              severity: nextStatus === "expired" ? "high" : "medium",
              personId: data.personId || null,
              docType: data.docType || "Documento",
              documentId: document.id,
              status: nextStatus,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString()
            },
            { merge: true }
          );
      }
    }

    logger.info("Document status sync complete", { updated, scanned: snapshot.size });
  }
);

const AUDIT_COLLECTIONS = [
  {
    collection: "tenders",
    moduleName: "tenders"
  },
  {
    collection: "contracts",
    moduleName: "contracts"
  },
  {
    collection: "operationTasks",
    moduleName: "operationTasks"
  },
  {
    collection: "financeEntries",
    moduleName: "financeEntries"
  },
  {
    collection: "vacancies",
    moduleName: "vacancies"
  },
  {
    collection: "candidates",
    moduleName: "candidates"
  },
  {
    collection: "peopleRecords",
    moduleName: "peopleRecords"
  },
  {
    collection: "personDocuments",
    moduleName: "personDocuments"
  },
  {
    collection: "personContractAssignments",
    moduleName: "personContractAssignments"
  },
  {
    collection: "accreditationTemplates",
    moduleName: "accreditationTemplates"
  }
] as const;

type AuditableCollection = (typeof AUDIT_COLLECTIONS)[number]["collection"];
type AuditableModuleName = (typeof AUDIT_COLLECTIONS)[number]["moduleName"];

const AUDIT_IGNORED_FIELDS = new Set(["createdAt", "updatedAt", "updatedByUid", "updatedByEmail", "updatedByRole"]);

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

function computeChangedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): string[] {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return Array.from(keys)
    .filter((field) => !AUDIT_IGNORED_FIELDS.has(field))
    .filter((field) => !deepEqual(before?.[field], after?.[field]))
    .sort();
}

function resolveAuditActor(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const uid = (after?.updatedByUid as string | undefined) || (before?.updatedByUid as string | undefined) || null;
  const email = (after?.updatedByEmail as string | undefined) || (before?.updatedByEmail as string | undefined) || null;
  const role = (after?.updatedByRole as string | undefined) || (before?.updatedByRole as string | undefined) || null;

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

async function writeAuditEntry(
  tenantId: string,
  moduleName: AuditableModuleName,
  collection: AuditableCollection,
  docId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
) {
  const eventType = !before && after ? "created" : before && !after ? "deleted" : "updated";

  await db
    .collection("tenants")
    .doc(tenantId)
    .collection("auditLogs")
    .add({
      module: moduleName,
      collection,
      entityId: docId,
      eventType,
      actor: resolveAuditActor(before, after),
      changedFields: computeChangedFields(before, after),
      before,
      after,
      createdAt: FieldValue.serverTimestamp()
    });
}

function createAuditTrigger(collection: AuditableCollection, moduleName: AuditableModuleName) {
  return onDocumentWritten(`tenants/{tenantId}/${collection}/{docId}`, async (event) => {
    const tenantId = event.params.tenantId;
    const docId = event.params.docId;
    const before = event.data?.before.exists ? (event.data.before.data() as Record<string, unknown>) : null;
    const after = event.data?.after.exists ? (event.data.after.data() as Record<string, unknown>) : null;

    await writeAuditEntry(tenantId, moduleName, collection, docId, before, after);
  });
}

export const auditTenderChanges = createAuditTrigger("tenders", "tenders");
export const auditContractChanges = createAuditTrigger("contracts", "contracts");
export const auditOperationChanges = createAuditTrigger("operationTasks", "operationTasks");
export const auditFinanceChanges = createAuditTrigger("financeEntries", "financeEntries");
export const auditVacancyChanges = createAuditTrigger("vacancies", "vacancies");
export const auditCandidateChanges = createAuditTrigger("candidates", "candidates");
export const auditPeopleChanges = createAuditTrigger("peopleRecords", "peopleRecords");
export const auditPersonDocumentChanges = createAuditTrigger("personDocuments", "personDocuments");
export const auditPersonContractAssignmentChanges = createAuditTrigger(
  "personContractAssignments",
  "personContractAssignments"
);
export const auditAccreditationTemplateChanges = createAuditTrigger(
  "accreditationTemplates",
  "accreditationTemplates"
);

export const assignUserRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const callerRole =
    ((request.auth.token.tenantRole as UserRole | undefined) ||
      (request.auth.token.role as UserRole | undefined) ||
      "viewer");
  const callerPlatformRole = request.auth.token.platformRole as UserRole | undefined;
  const isPlatformAdmin = callerPlatformRole === "platform_admin" || callerRole === "platform_admin";
  const isTenantAdmin = callerRole === "tenant_admin";
  if (!isPlatformAdmin && !isTenantAdmin) {
    throw new HttpsError("permission-denied", "Only tenant_admin or platform_admin can assign claims.");
  }

  const uid = typeof request.data?.uid === "string" ? request.data.uid : "";
  const role = request.data?.role as UserRole;
  if (role === "platform_admin" && !isPlatformAdmin) {
    throw new HttpsError("permission-denied", "Only platform_admin can assign platform role.");
  }
  const tenantId =
    typeof request.data?.tenantId === "string"
      ? request.data.tenantId
      : (request.auth.token.tenantId as string | undefined) || "crea-default";

  if (!isPlatformAdmin) {
    const callerTenantId = request.auth.token.tenantId as string | undefined;
    if (!callerTenantId || tenantId !== callerTenantId) {
      throw new HttpsError("permission-denied", "Tenant admin can only assign users inside their tenant.");
    }
  }

  if (!uid) {
    throw new HttpsError("invalid-argument", "uid is required.");
  }

  if (!USER_ROLES.includes(role)) {
    throw new HttpsError("invalid-argument", "Invalid role.");
  }

  const targetUser = await auth.getUser(uid);
  const existingClaims = targetUser.customClaims || {};
  await auth.setCustomUserClaims(uid, {
    ...existingClaims,
    role,
    tenantRole: role === "platform_admin" ? null : role,
    tenantId,
    platformRole: role === "platform_admin" ? "platform_admin" : null
  });

  return {
    ok: true,
    uid,
    role,
    tenantId
  };
});
