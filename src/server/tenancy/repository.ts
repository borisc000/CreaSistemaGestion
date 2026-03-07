import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type {
  TenantDomain,
  TenantInvitation,
  TenantRecord,
  TenantStatus,
  TenantUserMembership,
  TenantUserStatus
} from "@/types/domain";

const TENANTS_COLLECTION = "tenants";
const TENANT_USERS_COLLECTION = "tenantUsers";
const TENANT_INVITATIONS_COLLECTION = "tenantInvitations";
const TENANT_DOMAINS_COLLECTION = "tenantDomains";
const TENANT_SCOPED_COLLECTIONS_TO_DELETE = [
  "tenders",
  "contracts",
  "operationTasks",
  "financeEntries",
  "vacancies",
  "candidates",
  "peopleRecords",
  "personDocuments",
  "personContractAssignments",
  "accreditationTemplates",
  "auditLogs",
  "alerts"
] as const;

function toIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function normalizeDoc<T extends { id: string }>(id: string, data: Record<string, unknown>): T {
  return {
    ...(data as T),
    id
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeHost(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
}

export function isLocalHost(host: string | null): boolean {
  if (!host) return true;
  const normalized = normalizeHost(host);
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost")
  );
}

export function tenantUserDocId(tenantId: string, uid: string) {
  return `${tenantId}_${uid}`;
}

type CreateTenantInput = {
  id?: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: TenantRecord["plan"];
  ownerUserId: string | null;
};

export async function createTenant(input: CreateTenantInput): Promise<TenantRecord> {
  const id = input.id || randomUUID();
  const now = nowIso();
  await adminDb.collection(TENANTS_COLLECTION).doc(id).set({
    name: input.name,
    slug: input.slug,
    status: input.status,
    plan: input.plan,
    ownerUserId: input.ownerUserId,
    createdAt: now,
    updatedAt: now
  });

  return {
    id,
    name: input.name,
    slug: input.slug,
    status: input.status,
    plan: input.plan,
    ownerUserId: input.ownerUserId,
    createdAt: now,
    updatedAt: now
  };
}

export async function getTenantById(tenantId: string): Promise<TenantRecord | null> {
  const doc = await adminDb.collection(TENANTS_COLLECTION).doc(tenantId).get();
  if (!doc.exists) return null;
  const data = doc.data() || {};
  return normalizeDoc<TenantRecord>(doc.id, {
    ...data,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt)
  });
}

export async function getTenantBySlug(slug: string): Promise<TenantRecord | null> {
  const snapshot = await adminDb.collection(TENANTS_COLLECTION).where("slug", "==", slug).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  const data = doc.data() || {};
  return normalizeDoc<TenantRecord>(doc.id, {
    ...data,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt)
  });
}

export async function listTenants(options?: { status?: TenantStatus; q?: string }): Promise<TenantRecord[]> {
  let query: FirebaseFirestore.Query = adminDb.collection(TENANTS_COLLECTION);
  if (options?.status) {
    query = query.where("status", "==", options.status);
  }

  const snapshot = await query.limit(200).get();
  const q = options?.q?.trim().toLowerCase() || "";
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      return normalizeDoc<TenantRecord>(doc.id, {
        ...data,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt)
      });
    })
    .filter((tenant) => {
      if (!q) return true;
      return [tenant.name, tenant.slug, tenant.id].join(" ").toLowerCase().includes(q);
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

type TenantPatch = Partial<Pick<TenantRecord, "name" | "slug" | "status" | "plan" | "ownerUserId">>;

export async function patchTenant(tenantId: string, patch: TenantPatch): Promise<void> {
  await adminDb.collection(TENANTS_COLLECTION).doc(tenantId).set(
    {
      ...patch,
      updatedAt: nowIso()
    },
    { merge: true }
  );
}

type UpsertMembershipInput = {
  tenantId: string;
  uid: string;
  email: string;
  role: TenantUserMembership["role"];
  status: TenantUserStatus;
  invitedByUid: string | null;
  acceptedAt?: string | null;
};

export async function upsertTenantMembership(input: UpsertMembershipInput): Promise<TenantUserMembership> {
  const id = tenantUserDocId(input.tenantId, input.uid);
  const now = nowIso();
  const docRef = adminDb.collection(TENANT_USERS_COLLECTION).doc(id);
  const existing = await docRef.get();
  const createdAt = existing.exists ? toIso(existing.data()?.createdAt) : now;

  const payload = {
    tenantId: input.tenantId,
    uid: input.uid,
    email: input.email.toLowerCase(),
    role: input.role,
    status: input.status,
    invitedByUid: input.invitedByUid,
    acceptedAt: input.acceptedAt ?? null,
    createdAt,
    updatedAt: now
  };

  await docRef.set(payload, { merge: true });
  return normalizeDoc<TenantUserMembership>(id, payload);
}

export async function getTenantMembership(tenantId: string, uid: string): Promise<TenantUserMembership | null> {
  const id = tenantUserDocId(tenantId, uid);
  const doc = await adminDb.collection(TENANT_USERS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  const data = doc.data() || {};
  return normalizeDoc<TenantUserMembership>(doc.id, {
    ...data,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt)
  });
}

export async function listTenantMemberships(tenantId: string): Promise<TenantUserMembership[]> {
  const snapshot = await adminDb
    .collection(TENANT_USERS_COLLECTION)
    .where("tenantId", "==", tenantId)
    .limit(300)
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      return normalizeDoc<TenantUserMembership>(doc.id, {
        ...data,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt)
      });
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function countTenantMembersForLimit(tenantId: string): Promise<number> {
  const memberships = await listTenantMemberships(tenantId);
  return memberships.filter((membership) => membership.status === "active" || membership.status === "invited").length;
}

export async function listMembershipsByUid(uid: string): Promise<TenantUserMembership[]> {
  const snapshot = await adminDb.collection(TENANT_USERS_COLLECTION).where("uid", "==", uid).limit(50).get();
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      return normalizeDoc<TenantUserMembership>(doc.id, {
        ...data,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt)
      });
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

type CreateInvitationInput = {
  tenantId: string;
  email: string;
  role: TenantInvitation["role"];
  expiresAt: string;
  invitedByUid: string;
  tokenHash: string;
};

export async function createTenantInvitation(input: CreateInvitationInput): Promise<TenantInvitation> {
  const id = randomUUID();
  const now = nowIso();
  const payload = {
    tenantId: input.tenantId,
    email: input.email.toLowerCase(),
    role: input.role,
    status: "pending",
    expiresAt: input.expiresAt,
    invitedByUid: input.invitedByUid,
    tokenHash: input.tokenHash,
    createdAt: now,
    updatedAt: now,
    acceptedByUid: null,
    acceptedAt: null
  } satisfies Omit<TenantInvitation, "id">;

  await adminDb.collection(TENANT_INVITATIONS_COLLECTION).doc(id).set(payload);
  return normalizeDoc<TenantInvitation>(id, payload as Record<string, unknown>);
}

type InvitationPatch = Partial<
  Pick<TenantInvitation, "status" | "expiresAt" | "tokenHash" | "acceptedByUid" | "acceptedAt" | "role">
>;

export async function patchTenantInvitation(invitationId: string, patch: InvitationPatch): Promise<void> {
  await adminDb.collection(TENANT_INVITATIONS_COLLECTION).doc(invitationId).set(
    {
      ...patch,
      updatedAt: nowIso()
    },
    { merge: true }
  );
}

export async function getTenantInvitationById(invitationId: string): Promise<TenantInvitation | null> {
  const doc = await adminDb.collection(TENANT_INVITATIONS_COLLECTION).doc(invitationId).get();
  if (!doc.exists) return null;
  const data = doc.data() || {};
  return normalizeDoc<TenantInvitation>(doc.id, {
    ...data,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    acceptedAt: data.acceptedAt ? toIso(data.acceptedAt) : null
  });
}

export async function getTenantInvitationByTokenHash(tokenHash: string): Promise<TenantInvitation | null> {
  const snapshot = await adminDb
    .collection(TENANT_INVITATIONS_COLLECTION)
    .where("tokenHash", "==", tokenHash)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  const data = doc.data() || {};
  return normalizeDoc<TenantInvitation>(doc.id, {
    ...data,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    acceptedAt: data.acceptedAt ? toIso(data.acceptedAt) : null
  });
}

export async function listTenantInvitations(tenantId: string): Promise<TenantInvitation[]> {
  const snapshot = await adminDb
    .collection(TENANT_INVITATIONS_COLLECTION)
    .where("tenantId", "==", tenantId)
    .limit(300)
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      return normalizeDoc<TenantInvitation>(doc.id, {
        ...data,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
        acceptedAt: data.acceptedAt ? toIso(data.acceptedAt) : null
      });
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

type UpsertDomainInput = {
  host: string;
  tenantId: string;
  type: TenantDomain["type"];
  verified: boolean;
  status: TenantDomain["status"];
};

export async function upsertTenantDomain(input: UpsertDomainInput): Promise<TenantDomain> {
  const host = normalizeHost(input.host);
  const now = nowIso();
  const ref = adminDb.collection(TENANT_DOMAINS_COLLECTION).doc(host);
  const existing = await ref.get();
  const createdAt = existing.exists ? toIso(existing.data()?.createdAt) : now;
  const payload = {
    tenantId: input.tenantId,
    host,
    type: input.type,
    verified: input.verified,
    status: input.status,
    createdAt,
    updatedAt: now
  } satisfies Omit<TenantDomain, "id">;

  await ref.set(payload, { merge: true });
  return normalizeDoc<TenantDomain>(host, payload as Record<string, unknown>);
}

export async function getTenantDomainByHost(host: string): Promise<TenantDomain | null> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return null;
  const doc = await adminDb.collection(TENANT_DOMAINS_COLLECTION).doc(normalizedHost).get();
  if (!doc.exists) return null;
  const data = doc.data() || {};
  return normalizeDoc<TenantDomain>(doc.id, {
    ...data,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt)
  });
}

export async function listTenantDomains(tenantId?: string): Promise<TenantDomain[]> {
  let query: FirebaseFirestore.Query = adminDb.collection(TENANT_DOMAINS_COLLECTION);
  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }

  const snapshot = await query.limit(300).get();
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      return normalizeDoc<TenantDomain>(doc.id, {
        ...data,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt)
      });
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function deleteByQuery(query: FirebaseFirestore.Query, batchSize = 200): Promise<number> {
  let deleted = 0;

  while (true) {
    const snapshot = await query.limit(batchSize).get();
    if (snapshot.empty) {
      break;
    }

    const batch = adminDb.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    deleted += snapshot.size;

    if (snapshot.size < batchSize) {
      break;
    }
  }

  return deleted;
}

export async function deleteTenantHard(tenantId: string): Promise<{
  deletedTenantScoped: number;
  deletedMemberships: number;
  deletedInvitations: number;
  deletedDomains: number;
}> {
  const tenantRef = adminDb.collection(TENANTS_COLLECTION).doc(tenantId);

  let deletedTenantScoped = 0;
  for (const collectionKey of TENANT_SCOPED_COLLECTIONS_TO_DELETE) {
    deletedTenantScoped += await deleteByQuery(tenantRef.collection(collectionKey));
  }

  const [deletedMemberships, deletedInvitations, deletedDomains] = await Promise.all([
    deleteByQuery(adminDb.collection(TENANT_USERS_COLLECTION).where("tenantId", "==", tenantId)),
    deleteByQuery(adminDb.collection(TENANT_INVITATIONS_COLLECTION).where("tenantId", "==", tenantId)),
    deleteByQuery(adminDb.collection(TENANT_DOMAINS_COLLECTION).where("tenantId", "==", tenantId))
  ]);

  await tenantRef.delete();

  return {
    deletedTenantScoped,
    deletedMemberships,
    deletedInvitations,
    deletedDomains
  };
}
