import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/request-context", () => ({
  getTenantContext: vi.fn()
}));

vi.mock("@/server/domain/correspondence-upload-intents", () => ({
  createCorrespondenceUploadIntent: vi.fn()
}));

vi.mock("@/server/domain/correspondence", () => ({
  runCorrespondenceDocxJob: vi.fn()
}));

vi.mock("@/server/repositories/firestore-repository", () => ({
  createEntity: vi.fn(),
  getEntity: vi.fn(),
  patchEntity: vi.fn()
}));

import { POST as templateUploadIntentPost } from "@/app/api/correspondence/templates/upload-intent/route";
import { POST as runJobPost } from "@/app/api/correspondence/jobs/run/route";
import { getTenantContext } from "@/server/auth/request-context";
import { createCorrespondenceUploadIntent } from "@/server/domain/correspondence-upload-intents";
import { runCorrespondenceDocxJob } from "@/server/domain/correspondence";
import { createEntity, getEntity, patchEntity } from "@/server/repositories/firestore-repository";

describe("correspondence routes", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("creates template upload intent", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "admin-1",
      role: "tenant_admin",
      email: "admin@acme.com"
    } as never);

    vi.mocked(createCorrespondenceUploadIntent).mockResolvedValue({
      uploadIntentId: "intent-1",
      uploadPath: "tenants/tenant-a/correspondence/templates/1-template.docx",
      expiresAt: "2026-03-08T12:00:00.000Z"
    });

    const req = new NextRequest("http://localhost/api/correspondence/templates/upload-intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "template.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 1024
      })
    });

    const response = await templateUploadIntentPost(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.uploadIntentId).toBe("intent-1");
    expect(vi.mocked(createCorrespondenceUploadIntent)).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        kind: "template"
      })
    );
  });

  it("runs correspondence job and marks it completed", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "admin-1",
      role: "tenant_admin",
      email: "admin@acme.com"
    } as never);

    vi.mocked(getEntity)
      .mockResolvedValueOnce({
        id: "tpl-1",
        name: "Template",
        fileName: "template.docx",
        filePath: "tenants/tenant-a/correspondence/templates/tpl-1.docx",
        delimiter: "angle",
        keys: ["nombre"],
        status: "active",
        createdAt: "2026-03-08T00:00:00.000Z",
        updatedAt: "2026-03-08T00:00:00.000Z"
      } as never)
      .mockResolvedValueOnce({
        id: "src-1",
        name: "Data",
        sourceType: "csv",
        fileName: "data.csv",
        filePath: "tenants/tenant-a/correspondence/data-sources/src-1.csv",
        rowsCount: 2,
        columns: ["nombre"],
        status: "active",
        createdAt: "2026-03-08T00:00:00.000Z",
        updatedAt: "2026-03-08T00:00:00.000Z"
      } as never)
      .mockResolvedValueOnce({
        id: "job-1",
        status: "completed",
        processedRows: 2,
        failedRows: 0,
        resultZipPath: "tenants/tenant-a/correspondence/jobs/job-1/result.zip"
      } as never);

    vi.mocked(createEntity).mockResolvedValue({
      id: "job-1",
      name: "Job marzo",
      templateId: "tpl-1",
      dataSourceId: "src-1",
      status: "processing",
      outputFormats: ["docx"],
      resultZipPath: null,
      processedRows: 0,
      failedRows: 0,
      errorMessage: null,
      startedAt: "2026-03-08T10:00:00.000Z",
      finishedAt: null,
      createdAt: "2026-03-08T10:00:00.000Z",
      updatedAt: "2026-03-08T10:00:00.000Z"
    } as never);
    vi.mocked(runCorrespondenceDocxJob).mockResolvedValue({
      processedRows: 2,
      failedRows: 0,
      resultZipPath: "tenants/tenant-a/correspondence/jobs/job-1/result.zip",
      rowsCount: 2,
      columns: ["nombre"]
    });
    vi.mocked(patchEntity).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/correspondence/jobs/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Job marzo",
        templateId: "tpl-1",
        dataSourceId: "src-1",
        outputFormats: ["docx"]
      })
    });

    const response = await runJobPost(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("completed");
    expect(vi.mocked(runCorrespondenceDocxJob)).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        jobId: "job-1",
        maxRows: 300
      })
    );
    expect(vi.mocked(patchEntity)).toHaveBeenCalledWith(
      "tenant-a",
      "correspondenceJobs",
      "job-1",
      expect.objectContaining({
        status: "completed",
        processedRows: 2
      }),
      expect.any(Object)
    );
  });

  it("marks job as failed when merge execution crashes", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "tenant-a",
      uid: "admin-1",
      role: "tenant_admin",
      email: "admin@acme.com"
    } as never);

    vi.mocked(getEntity)
      .mockResolvedValueOnce({
        id: "tpl-1",
        filePath: "tenants/tenant-a/correspondence/templates/tpl-1.docx",
        delimiter: "angle"
      } as never)
      .mockResolvedValueOnce({
        id: "src-1",
        sourceType: "csv",
        filePath: "tenants/tenant-a/correspondence/data-sources/src-1.csv"
      } as never);

    vi.mocked(createEntity).mockResolvedValue({
      id: "job-fail",
      name: "Job fail",
      templateId: "tpl-1",
      dataSourceId: "src-1",
      status: "processing",
      outputFormats: ["docx"],
      resultZipPath: null,
      processedRows: 0,
      failedRows: 0,
      errorMessage: null,
      startedAt: "2026-03-08T10:00:00.000Z",
      finishedAt: null,
      createdAt: "2026-03-08T10:00:00.000Z",
      updatedAt: "2026-03-08T10:00:00.000Z"
    } as never);
    vi.mocked(runCorrespondenceDocxJob).mockRejectedValue(new Error("merge failed"));
    vi.mocked(patchEntity).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/correspondence/jobs/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Job fail",
        templateId: "tpl-1",
        dataSourceId: "src-1",
        outputFormats: ["docx"]
      })
    });

    const response = await runJobPost(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Unexpected server error.");
    expect(vi.mocked(patchEntity)).toHaveBeenCalledWith(
      "tenant-a",
      "correspondenceJobs",
      "job-fail",
      expect.objectContaining({
        status: "failed"
      }),
      expect.any(Object)
    );
  });
});
