import type { NextRequest } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/server/auth/request-context";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import type { ModuleKey } from "@/types/domain";
import {
  createEntity,
  listEntities,
  patchEntity,
  type CollectionKey
} from "@/server/repositories/firestore-repository";

export type CrudHookContext<TCreate, TPatch> = {
  tenantId: string;
  createPayload?: TCreate;
  patchPayload?: TPatch;
};

export type CrudConfig<TCreate extends z.ZodTypeAny, TPatch extends z.ZodTypeAny> = {
  moduleKey: ModuleKey;
  collectionKey: CollectionKey;
  createSchema: TCreate;
  patchSchema: TPatch;
  beforeCreate?: (ctx: CrudHookContext<z.infer<TCreate>, z.infer<TPatch>>) => Promise<void>;
  beforePatch?: (ctx: CrudHookContext<z.infer<TCreate>, z.infer<TPatch>>) => Promise<void>;
};

export function buildCrudHandlers<TCreate extends z.ZodTypeAny, TPatch extends z.ZodTypeAny>(config: CrudConfig<TCreate, TPatch>) {
  async function GET(req: NextRequest) {
    try {
      const context = await getTenantContext(req, config.moduleKey);
      const data = await listEntities(context.tenantId, config.collectionKey);
      return jsonOk({ data });
    } catch (error) {
      return jsonError(error);
    }
  }

  async function POST(req: NextRequest) {
    try {
      const context = await getTenantContext(req, config.moduleKey);
      const body = await req.json();
      const parsed = config.createSchema.parse(body);

      if (config.beforeCreate) {
        await config.beforeCreate({ tenantId: context.tenantId, createPayload: parsed });
      }

      const created = await createEntity(context.tenantId, config.collectionKey, parsed as never);
      return jsonOk({ data: created }, 201);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
      }
      return jsonError(error);
    }
  }

  async function PATCH(req: NextRequest) {
    try {
      const context = await getTenantContext(req, config.moduleKey);
      const body = await req.json();
      const parsed = config.patchSchema.parse(body);
      const { id, ...patch } = parsed as { id: string } & Record<string, unknown>;

      if (config.beforePatch) {
        await config.beforePatch({ tenantId: context.tenantId, patchPayload: parsed });
      }

      await patchEntity(context.tenantId, config.collectionKey, id, patch as never);
      return jsonOk({ ok: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
      }
      return jsonError(error);
    }
  }

  return { GET, POST, PATCH };
}
