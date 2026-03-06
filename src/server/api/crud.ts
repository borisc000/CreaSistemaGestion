import type { NextRequest } from "next/server";
import { z } from "zod";
import { getModuleDefinition } from "@/modules/registry";
import { getTenantContext } from "@/server/auth/request-context";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { validateModuleRelations } from "@/server/validation/relations";
import type { ModuleKey } from "@/types/domain";
import type { CollectionKey } from "@/types/collections";
import {
  createEntity,
  listEntities,
  patchEntity
} from "@/server/repositories/firestore-repository";

export type CrudHookContext<TCreate, TPatch> = {
  tenantId: string;
  createPayload?: TCreate;
  patchPayload?: TPatch;
};

export type CrudConfig<TCreate extends z.ZodTypeAny, TPatch extends z.ZodTypeAny> = {
  moduleKey: ModuleKey;
  collectionKey?: CollectionKey;
  relationSet?: string;
  createSchema: TCreate;
  patchSchema: TPatch;
  beforeCreate?: (ctx: CrudHookContext<z.infer<TCreate>, z.infer<TPatch>>) => Promise<void>;
  beforePatch?: (ctx: CrudHookContext<z.infer<TCreate>, z.infer<TPatch>>) => Promise<void>;
};

function resolveCollectionKey(moduleKey: ModuleKey, explicitCollectionKey?: CollectionKey): CollectionKey {
  if (explicitCollectionKey) return explicitCollectionKey;

  const moduleDefinition = getModuleDefinition(moduleKey);
  if (moduleDefinition.primaryCollection) {
    return moduleDefinition.primaryCollection;
  }

  throw new Error(`Module ${moduleKey} has no primaryCollection. Pass collectionKey explicitly.`);
}

export function buildCrudHandlers<TCreate extends z.ZodTypeAny, TPatch extends z.ZodTypeAny>(config: CrudConfig<TCreate, TPatch>) {
  const collectionKey = resolveCollectionKey(config.moduleKey, config.collectionKey);

  async function GET(req: NextRequest) {
    try {
      const context = await getTenantContext(req, config.moduleKey, "read");
      const data = await listEntities(context.tenantId, collectionKey);
      return jsonOk({ data });
    } catch (error) {
      return jsonError(error);
    }
  }

  async function POST(req: NextRequest) {
    try {
      const context = await getTenantContext(req, config.moduleKey, "write");
      const body = await req.json();
      const parsed = config.createSchema.parse(body);

      await validateModuleRelations({
        tenantId: context.tenantId,
        moduleKey: config.moduleKey,
        payload: parsed as Record<string, unknown>,
        mode: "create",
        relationSet: config.relationSet
      });

      if (config.beforeCreate) {
        await config.beforeCreate({ tenantId: context.tenantId, createPayload: parsed });
      }

      const created = await createEntity(context.tenantId, collectionKey, parsed as never);
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
      const context = await getTenantContext(req, config.moduleKey, "write");
      const body = await req.json();
      const parsed = config.patchSchema.parse(body);
      const { id, ...patch } = parsed as { id: string } & Record<string, unknown>;

      await validateModuleRelations({
        tenantId: context.tenantId,
        moduleKey: config.moduleKey,
        payload: patch,
        mode: "patch",
        relationSet: config.relationSet
      });

      if (config.beforePatch) {
        await config.beforePatch({ tenantId: context.tenantId, patchPayload: parsed });
      }

      await patchEntity(context.tenantId, collectionKey, id, patch as never);
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
