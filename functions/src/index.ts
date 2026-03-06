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

const USER_ROLES = ["admin", "tender_lead", "contract_manager", "finance", "hr", "viewer"] as const;
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
    exportName: "auditContractChanges",
    collection: "contracts",
    moduleName: "contracts"
  },
  {
    exportName: "auditFinanceChanges",
    collection: "financeEntries",
    moduleName: "financeEntries"
  }
] as const;

type AuditableCollection = (typeof AUDIT_COLLECTIONS)[number]["collection"];
type AuditableModuleName = (typeof AUDIT_COLLECTIONS)[number]["moduleName"];

async function writeAuditEntry(
  tenantId: string,
  moduleName: AuditableModuleName,
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
      entityId: docId,
      eventType,
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

    await writeAuditEntry(tenantId, moduleName, docId, before, after);
  });
}

export const auditContractChanges = createAuditTrigger("contracts", "contracts");
export const auditFinanceChanges = createAuditTrigger("financeEntries", "financeEntries");

export const assignUserRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const callerRole = request.auth.token.role as UserRole | undefined;
  if (callerRole !== "admin") {
    throw new HttpsError("permission-denied", "Only admin role can assign claims.");
  }

  const uid = typeof request.data?.uid === "string" ? request.data.uid : "";
  const role = request.data?.role as UserRole;
  const tenantId =
    typeof request.data?.tenantId === "string"
      ? request.data.tenantId
      : (request.auth.token.tenantId as string | undefined) || "crea-default";

  if (!uid) {
    throw new HttpsError("invalid-argument", "uid is required.");
  }

  if (!USER_ROLES.includes(role)) {
    throw new HttpsError("invalid-argument", "Invalid role.");
  }

  await auth.setCustomUserClaims(uid, {
    role,
    tenantId
  });

  return {
    ok: true,
    uid,
    role,
    tenantId
  };
});
