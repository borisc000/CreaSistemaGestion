import { buildCrudHandlers } from "@/server/api/crud";
import { operationCreateSchema, operationPatchSchema } from "@/server/validation/schemas";

const handlers = buildCrudHandlers({
  moduleKey: "operations",
  createSchema: operationCreateSchema,
  patchSchema: operationPatchSchema
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
