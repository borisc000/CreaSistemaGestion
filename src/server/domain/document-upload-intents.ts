import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/server/api/response";

const DOCUMENT_UPLOAD_INTENTS_COLLECTION = "documentUploadIntents";
const ALLOWED_MIME_EXTENSIONS: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"]
};

export const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_UPLOAD_INTENT_TTL_MINUTES = 15;

type CreateDocumentUploadIntentInput = {
  tenantId: string;
  personId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  actor: {
    uid: string;
    email: string | null;
    role: string;
  };
};

type ConsumeDocumentUploadIntentInput = {
  tenantId: string;
  personId: string;
  uploadIntentId: string;
  expectedFileName: string;
  actor: {
    uid: string;
    email: string | null;
    role: string;
  };
};

type DocumentUploadIntentRecord = {
  personId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadPath: string;
  status: "pending" | "consumed";
  createdByUid: string;
  createdByEmail: string | null;
  createdByRole: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedByUid: string | null;
  consumedByEmail: string | null;
  consumedByRole: string | null;
};

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1 || lastDot === fileName.length - 1) {
    return "";
  }
  return fileName.slice(lastDot).toLowerCase();
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
}

function buildUploadPath(tenantId: string, personId: string, fileName: string): string {
  return `tenants/${tenantId}/people/${personId}/documents/${Date.now()}-${sanitizeFileName(fileName)}`;
}

function buildExpiryDate(now: Date): string {
  return new Date(now.getTime() + DOCUMENT_UPLOAD_INTENT_TTL_MINUTES * 60_000).toISOString();
}

function uploadIntentRef(tenantId: string, uploadIntentId: string) {
  return adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection(DOCUMENT_UPLOAD_INTENTS_COLLECTION)
    .doc(uploadIntentId);
}

export function validateDocumentUploadInput(input: { fileName: string; mimeType: string; sizeBytes: number }): void {
  const fileName = input.fileName.trim();
  const mimeType = input.mimeType.trim().toLowerCase();
  const sizeBytes = input.sizeBytes;

  if (!fileName) {
    throw new ApiError(400, "fileName is required.");
  }

  if (!mimeType || !ALLOWED_MIME_EXTENSIONS[mimeType]) {
    throw new ApiError(400, "Unsupported file type. Allowed: PDF, JPG, PNG.");
  }

  const extension = getFileExtension(fileName);
  if (!extension || !ALLOWED_MIME_EXTENSIONS[mimeType].includes(extension)) {
    throw new ApiError(400, "File extension does not match mimeType.");
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new ApiError(400, "sizeBytes must be greater than zero.");
  }

  if (sizeBytes > MAX_DOCUMENT_UPLOAD_BYTES) {
    throw new ApiError(400, `File exceeds max size (${MAX_DOCUMENT_UPLOAD_BYTES} bytes).`);
  }
}

export async function createDocumentUploadIntent(input: CreateDocumentUploadIntentInput): Promise<{
  uploadIntentId: string;
  uploadPath: string;
  expiresAt: string;
}> {
  validateDocumentUploadInput({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes
  });

  const now = new Date();
  const nowIso = now.toISOString();
  const uploadIntentId = randomUUID();
  const uploadPath = buildUploadPath(input.tenantId, input.personId, input.fileName);
  const expiresAt = buildExpiryDate(now);

  const payload: DocumentUploadIntentRecord = {
    personId: input.personId,
    fileName: input.fileName,
    mimeType: input.mimeType.toLowerCase(),
    sizeBytes: input.sizeBytes,
    uploadPath,
    status: "pending",
    createdByUid: input.actor.uid,
    createdByEmail: input.actor.email,
    createdByRole: input.actor.role,
    createdAt: nowIso,
    updatedAt: nowIso,
    expiresAt,
    consumedAt: null,
    consumedByUid: null,
    consumedByEmail: null,
    consumedByRole: null
  };

  await uploadIntentRef(input.tenantId, uploadIntentId).set(payload);
  return {
    uploadIntentId,
    uploadPath,
    expiresAt
  };
}

export async function consumeDocumentUploadIntent(input: ConsumeDocumentUploadIntentInput): Promise<{ uploadPath: string }> {
  const ref = uploadIntentRef(input.tenantId, input.uploadIntentId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new ApiError(404, "Upload intent not found.");
  }

  const data = snapshot.data() as DocumentUploadIntentRecord;
  if (data.status !== "pending") {
    throw new ApiError(409, "Upload intent is not available.");
  }

  const now = new Date();
  if (new Date(data.expiresAt).getTime() <= now.getTime()) {
    await ref.set(
      {
        status: "consumed",
        consumedAt: now.toISOString(),
        updatedAt: now.toISOString()
      },
      { merge: true }
    );
    throw new ApiError(410, "Upload intent expired.");
  }

  if (data.personId !== input.personId) {
    throw new ApiError(409, "Upload intent does not belong to this person.");
  }

  if (data.fileName !== input.expectedFileName) {
    throw new ApiError(409, "fileName does not match upload intent.");
  }

  await ref.set(
    {
      status: "consumed",
      consumedAt: now.toISOString(),
      consumedByUid: input.actor.uid,
      consumedByEmail: input.actor.email,
      consumedByRole: input.actor.role,
      updatedAt: now.toISOString()
    },
    { merge: true }
  );

  return {
    uploadPath: data.uploadPath
  };
}

