import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/response";

vi.mock("@/server/auth/request-context", () => ({
  getTenantContext: vi.fn()
}));

vi.mock("@/server/repositories/firestore-repository", () => ({
  getEntity: vi.fn(),
  listEntities: vi.fn(),
  createEntity: vi.fn(),
  patchEntity: vi.fn()
}));

vi.mock("@/server/validation/relations", () => ({
  validateModuleRelations: vi.fn()
}));

vi.mock("@/server/domain/document-upload-intents", () => ({
  createDocumentUploadIntent: vi.fn(),
  consumeDocumentUploadIntent: vi.fn()
}));

import { POST as uploadIntentPost } from "@/app/api/hr/documents/upload-intent/route";
import { POST as documentsPost } from "@/app/api/hr/documents/route";
import { getTenantContext } from "@/server/auth/request-context";
import { createEntity, getEntity } from "@/server/repositories/firestore-repository";
import { validateModuleRelations } from "@/server/validation/relations";
import { createDocumentUploadIntent, consumeDocumentUploadIntent } from "@/server/domain/document-upload-intents";

describe("hr documents APIs", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("creates upload intent for valid file", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "hr",
      email: "hr@acme.com"
    } as never);
    vi.mocked(getEntity).mockResolvedValue({
      id: "person-1"
    } as never);
    vi.mocked(createDocumentUploadIntent).mockResolvedValue({
      uploadIntentId: "intent-1",
      uploadPath: "tenants/tenant-a/people/person-1/documents/1-file.pdf",
      expiresAt: "2026-03-08T12:00:00.000Z"
    });

    const req = new NextRequest("http://localhost/api/hr/documents/upload-intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personId: "person-1",
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: 500_000
      })
    });

    const response = await uploadIntentPost(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.uploadIntentId).toBe("intent-1");
    expect(vi.mocked(createDocumentUploadIntent)).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        personId: "person-1",
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: 500_000
      })
    );
  });

  it("rejects upload intent when person does not exist", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "hr",
      email: "hr@acme.com"
    } as never);
    vi.mocked(getEntity).mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/hr/documents/upload-intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personId: "person-404",
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: 500_000
      })
    });

    const response = await uploadIntentPost(req);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain("Person not found");
  });

  it("returns validation error from upload intent service (invalid mime/size)", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "hr",
      email: "hr@acme.com"
    } as never);
    vi.mocked(getEntity).mockResolvedValue({
      id: "person-1"
    } as never);
    vi.mocked(createDocumentUploadIntent).mockRejectedValue(
      new ApiError(400, "Unsupported file type. Allowed: PDF, JPG, PNG.")
    );

    const req = new NextRequest("http://localhost/api/hr/documents/upload-intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personId: "person-1",
        fileName: "malware.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 1024
      })
    });

    const response = await uploadIntentPost(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Unsupported file type");
  });

  it("creates person document only with valid upload intent", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "hr",
      email: "hr@acme.com"
    } as never);
    vi.mocked(validateModuleRelations).mockResolvedValue(undefined);
    vi.mocked(consumeDocumentUploadIntent).mockResolvedValue({
      uploadPath: "tenants/tenant-a/people/person-1/documents/1-doc.pdf"
    });
    vi.mocked(createEntity).mockResolvedValue({
      id: "doc-1",
      personId: "person-1",
      docType: "Contrato",
      fileName: "doc.pdf",
      filePath: "tenants/tenant-a/people/person-1/documents/1-doc.pdf",
      status: "uploaded",
      expiryDate: null,
      createdAt: "2026-03-08T11:00:00.000Z",
      updatedAt: "2026-03-08T11:00:00.000Z"
    } as never);

    const req = new NextRequest("http://localhost/api/hr/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personId: "person-1",
        uploadIntentId: "intent-1",
        docType: "Contrato",
        fileName: "doc.pdf",
        expiryDate: null
      })
    });

    const response = await documentsPost(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.filePath).toContain("tenants/tenant-a/people/person-1");
    expect(vi.mocked(consumeDocumentUploadIntent)).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        personId: "person-1",
        uploadIntentId: "intent-1"
      })
    );
  });

  it("fails when upload intent is already consumed", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "hr",
      email: "hr@acme.com"
    } as never);
    vi.mocked(validateModuleRelations).mockResolvedValue(undefined);
    vi.mocked(consumeDocumentUploadIntent).mockRejectedValue(new ApiError(409, "Upload intent is not available."));

    const req = new NextRequest("http://localhost/api/hr/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personId: "person-1",
        uploadIntentId: "intent-1",
        docType: "Contrato",
        fileName: "doc.pdf",
        expiryDate: null
      })
    });

    const response = await documentsPost(req);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("not available");
  });

  it("fails when upload intent is expired", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "caller-1",
      role: "hr",
      email: "hr@acme.com"
    } as never);
    vi.mocked(validateModuleRelations).mockResolvedValue(undefined);
    vi.mocked(consumeDocumentUploadIntent).mockRejectedValue(new ApiError(410, "Upload intent expired."));

    const req = new NextRequest("http://localhost/api/hr/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personId: "person-1",
        uploadIntentId: "intent-expired",
        docType: "Contrato",
        fileName: "doc.pdf",
        expiryDate: null
      })
    });

    const response = await documentsPost(req);
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.error).toContain("expired");
  });
});
