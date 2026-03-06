import { buildCrudHandlers } from "@/server/api/crud";
import { financeCreateSchema, financePatchSchema } from "@/server/validation/schemas";

const handlers = buildCrudHandlers({
  moduleKey: "finance",
  createSchema: financeCreateSchema,
  patchSchema: financePatchSchema
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
