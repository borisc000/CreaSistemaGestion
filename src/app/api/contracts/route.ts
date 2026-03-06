import { buildCrudHandlers } from "@/server/api/crud";
import { contractCreateSchema, contractPatchSchema } from "@/server/validation/schemas";

const handlers = buildCrudHandlers({
  moduleKey: "contracts",
  createSchema: contractCreateSchema,
  patchSchema: contractPatchSchema
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
