import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/server/api/response";
import type { CorrespondenceSourceType } from "@/types/domain";

const CORRESPONDENCE_UPLOAD_INTENTS_COLLECTION = "correspondenceUploadIntents";
const CORRESPONDENCE_UPLOAD_INTENT_TTL_MINUTES = 15;
const MAX_TEMPLATE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_DATA_SOURCE_UPLOAD_BYTES = 15 * 1024 * 1024;

type UploadIntentKind = "template" | "data_source";

type CreateCorrespondenceUploadIntentInput = {
  tenantId: string;
  kind: UploadIntentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sourceType?: CorrespondenceSourceType;
  actor: {
    uid: string;
    email: string | null;
    role: string;
  };
};

type ConsumeCorrespondenceUploadIntentInput = {
  tenantId: string;
  uploadIntentId: string;
  kind: UploadIntentKind;
  expectedFileName: string;
  expectedSourceType?: CorrespondenceSourceType;
  actor: {
    uid: string;
    email: string | null;
    role: string;
  };
};

type CorrespondenceUploadIntentRecord = {
  kind: UploadIntentKind;
  sourceType: CorrespondenceSourceType | null;
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

function buildUploadPath(
  tenantId: string,
  kind: UploadIntentKind,
  fileName: string
): string {
  const baseFolder = kind === "template" ? "templates" : "data-sources";
  return `tenants/${tenantId}/correspondence/${baseFolder}/${Date.now()}-${sanitizeFileName(fileName)}`;
}

function buildExpiryDate(now: Date): string {
  return new Date(now.getTime() + CORRESPONDENCE_UPLOAD_INTENT_TTL_MINUTES * 60_000).toISOString();
}

function uploadIntentRef(tenantId: string, uploadIntentId: string) {
  return adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection(CORRESPONDENCE_UPLOAD_INTENTS_COLLECTION)
    .doc(uploadIntentId);
}

function assertTemplateUpload(fileName: string, mimeType: string, sizeBytes: number) {
  const extension = getFileExtension(fileName);
  if (extension !== ".docx") {
    throw new ApiError(400, "Template must be a .docx file.");
  }

  if (
    mimeType !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
    mimeType !== "application/octet-stream"
  ) {
    throw new ApiError(400, "Unsupported template mimeType.");
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new ApiError(400, "sizeBytes must be greater than zero.");
  }

  if (sizeBytes > MAX_TEMPLATE_UPLOAD_BYTES) {
    throw new ApiError(400, `Template exceeds max size (${MAX_TEMPLATE_UPLOAD_BYTES} bytes).`);
  }
}

function assertDataSourceUpload(fileName: string, mimeType: string, sizeBytes: number, sourceType?: CorrespondenceSourceType) {
  if (!sourceType) {
    throw new ApiError(400, "sourceType is required for data source uploads.");
  }

  const extension = getFileExtension(fileName);
  const expectedExtensionByType: Record<CorrespondenceSourceType, string> = {
    csv: ".csv",
    xlsx: ".xlsx",
    json: ".json"
  };
  if (extension !== expectedExtensionByType[sourceType]) {
    throw new ApiError(400, `Data source file extension must be ${expectedExtensionByType[sourceType]}.`);
  }

  const allowedMimeByType: Record<CorrespondenceSourceType, string[]> = {
    csv: ["text/csv", "text/plain", "application/csv", "application/vnd.ms-excel", "application/octet-stream"],
    xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"],
    json: ["application/json", "text/json", "text/plain", "application/octet-stream"]
  };
  if (!allowedMimeByType[sourceType].includes(mimeType)) {
    throw new ApiError(400, "Unsupported data source mimeType.");
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new ApiError(400, "sizeBytes must be greater than zero.");
  }

  if (sizeBytes > MAX_DATA_SOURCE_UPLOAD_BYTES) {
    throw new ApiError(400, `Data source exceeds max size (${MAX_DATA_SOURCE_UPLOAD_BYTES} bytes).`);
  }
}

export function validateCorrespondenceUploadInput(input: {
  kind: UploadIntentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sourceType?: CorrespondenceSourceType;
}): void {
  const fileName = input.fileName.trim();
  const mimeType = input.mimeType.trim().toLowerCase();
  const sizeBytes = input.sizeBytes;

  if (!fileName) {
    throw new ApiError(400, "fileName is required.");
  }

  if (input.kind === "template") {
    assertTemplateUpload(fileName, mimeType, sizeBytes);
    return;
  }

  assertDataSourceUpload(fileName, mimeType, sizeBytes, input.sourceType);
}

export async function createCorrespondenceUploadIntent(
  input: CreateCorrespondenceUploadIntentInput
): Promise<{ uploadIntentId: string; uploadPath: string; expiresAt: string }> {
  validateCorrespondenceUploadInput({
    kind: input.kind,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    sourceType: input.sourceType
  });

  const now = new Date();
  const nowIso = now.toISOString();
  const uploadIntentId = randomUUID();
  const uploadPath = buildUploadPath(input.tenantId, input.kind, input.fileName);
  const expiresAt = buildExpiryDate(now);

  const payload: CorrespondenceUploadIntentRecord = {
    kind: input.kind,
    sourceType: input.kind === "data_source" ? input.sourceType || null : null,
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

export async function consumeCorrespondenceUploadIntent(
  input: ConsumeCorrespondenceUploadIntentInput
): Promise<{ uploadPath: string }> {
  const ref = uploadIntentRef(input.tenantId, input.uploadIntentId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new ApiError(404, "Upload intent not found.");
  }

  const data = snapshot.data() as CorrespondenceUploadIntentRecord;
  if (data.status !== "pending") {
    throw new ApiError(409, "Upload intent is not available.");
  }

  if (data.kind !== input.kind) {
    throw new ApiError(409, "Upload intent kind mismatch.");
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

  if (data.fileName !== input.expectedFileName) {
    throw new ApiError(409, "fileName does not match upload intent.");
  }

  if (input.kind === "data_source" && data.sourceType !== input.expectedSourceType) {
    throw new ApiError(409, "sourceType does not match upload intent.");
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
