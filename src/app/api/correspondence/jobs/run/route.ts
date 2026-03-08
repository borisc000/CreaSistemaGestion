import { z } from "zod";
import type { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { runCorrespondenceDocxJob } from "@/server/domain/correspondence";
import { createEntity, getEntity, patchEntity, type WriteActor } from "@/server/repositories/firestore-repository";
import { correspondenceJobRunSchema } from "@/server/validation/schemas";
import type { CorrespondenceDataSource, CorrespondenceJob, CorrespondenceTemplate } from "@/types/domain";

const MAX_ROWS_PER_SYNC_JOB = 300;

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let tenantId: string | null = null;
  let actor: WriteActor | null = null;
  let jobId: string | null = null;

  try {
    const context = await getTenantContext(req, "correspondencia_cruzada", "write");
    tenantId = context.tenantId;
    actor = {
      uid: context.uid,
      email: context.email,
      role: context.role
    };
    const parsed = correspondenceJobRunSchema.parse(await req.json());

    const [template, dataSource] = await Promise.all([
      getEntity(context.tenantId, "correspondenceTemplates", parsed.templateId),
      getEntity(context.tenantId, "correspondenceDataSources", parsed.dataSourceId)
    ]);

    if (!template) {
      throw new ApiError(404, "Template not found.");
    }
    if (!dataSource) {
      throw new ApiError(404, "Data source not found.");
    }

    const created = await createEntity(
      context.tenantId,
      "correspondenceJobs",
      {
        name: parsed.name,
        templateId: parsed.templateId,
        dataSourceId: parsed.dataSourceId,
        status: "processing",
        outputFormats: parsed.outputFormats,
        resultZipPath: null,
        processedRows: 0,
        failedRows: 0,
        errorMessage: null,
        startedAt: new Date().toISOString(),
        finishedAt: null
      },
      actor
    );

    jobId = created.id;

    const result = await runCorrespondenceDocxJob({
      tenantId: context.tenantId,
      jobId: created.id,
      jobName: parsed.name,
      template: template as CorrespondenceTemplate,
      dataSource: dataSource as CorrespondenceDataSource,
      outputFormats: parsed.outputFormats,
      maxRows: MAX_ROWS_PER_SYNC_JOB
    });

    await patchEntity(
      context.tenantId,
      "correspondenceJobs",
      created.id,
      {
        status: "completed",
        processedRows: result.processedRows,
        failedRows: result.failedRows,
        resultZipPath: result.resultZipPath,
        errorMessage: null,
        finishedAt: new Date().toISOString()
      },
      actor
    );

    const updated = (await getEntity(context.tenantId, "correspondenceJobs", created.id)) as CorrespondenceJob | null;
    return jsonOk({ data: updated || { ...created, status: "completed" } });
  } catch (error) {
    if (tenantId && actor && jobId) {
      await patchEntity(
        tenantId,
        "correspondenceJobs",
        jobId,
        {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unexpected correspondence job failure.",
          finishedAt: new Date().toISOString()
        },
        actor
      ).catch(() => null);
    }
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}
