import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { CollectionKey } from "@/types/collections";
import type {
  AccreditationTemplate,
  Candidate,
  CorrespondenceDataSource,
  CorrespondenceJob,
  CorrespondenceTemplate,
  Contract,
  FinanceEntry,
  OperationTask,
  PersonContractAssignment,
  PersonDocument,
  PersonRecord,
  Tender,
  UserRole,
  Vacancy
} from "@/types/domain";

type EntityMap = {
  tenders: Tender;
  contracts: Contract;
  operationTasks: OperationTask;
  financeEntries: FinanceEntry;
  vacancies: Vacancy;
  candidates: Candidate;
  peopleRecords: PersonRecord;
  personDocuments: PersonDocument;
  personContractAssignments: PersonContractAssignment;
  accreditationTemplates: AccreditationTemplate;
  correspondenceTemplates: CorrespondenceTemplate;
  correspondenceDataSources: CorrespondenceDataSource;
  correspondenceJobs: CorrespondenceJob;
};

export type WriteActor = {
  uid: string;
  email: string | null;
  role: UserRole;
};

function tenantCollection(tenantId: string, key: CollectionKey) {
  return adminDb.collection("tenants").doc(tenantId).collection(key);
}

function toIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return typeof value === "string" ? value : new Date().toISOString();
}

function normalizeDoc<T extends { id: string; createdAt: string; updatedAt: string }>(
  id: string,
  data: Record<string, unknown>
): T {
  return {
    ...(data as T),
    id,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt)
  };
}

export async function listEntities<K extends CollectionKey>(tenantId: string, key: K): Promise<EntityMap[K][]> {
  const snapshot = await tenantCollection(tenantId, key).orderBy("createdAt", "desc").get();
  return snapshot.docs.map((doc) => normalizeDoc<EntityMap[K]>(doc.id, doc.data()));
}

export async function createEntity<K extends CollectionKey>(
  tenantId: string,
  key: K,
  payload: Omit<EntityMap[K], "id" | "createdAt" | "updatedAt">,
  actor?: WriteActor
): Promise<EntityMap[K]> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await tenantCollection(tenantId, key).doc(id).set({
    ...payload,
    updatedByUid: actor?.uid || null,
    updatedByEmail: actor?.email || null,
    updatedByRole: actor?.role || null,
    createdAt: now,
    updatedAt: now
  });

  return {
    ...(payload as EntityMap[K]),
    id,
    createdAt: now,
    updatedAt: now
  };
}

export async function patchEntity<K extends CollectionKey>(
  tenantId: string,
  key: K,
  id: string,
  patch: Partial<Omit<EntityMap[K], "id" | "createdAt" | "updatedAt">>,
  actor?: WriteActor
): Promise<void> {
  await tenantCollection(tenantId, key).doc(id).set(
    {
      ...patch,
      updatedByUid: actor?.uid || null,
      updatedByEmail: actor?.email || null,
      updatedByRole: actor?.role || null,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );
}

export async function getEntity<K extends CollectionKey>(
  tenantId: string,
  key: K,
  id: string
): Promise<EntityMap[K] | null> {
  const doc = await tenantCollection(tenantId, key).doc(id).get();
  if (!doc.exists) return null;
  return normalizeDoc<EntityMap[K]>(doc.id, doc.data() || {});
}
