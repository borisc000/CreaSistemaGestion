import { buildCrudHandlers } from "@/server/api/crud";
import { tenderCreateSchema, tenderPatchSchema } from "@/server/validation/schemas";

const handlers = buildCrudHandlers({
  moduleKey: "tenders",
  collectionKey: "tenders",
  createSchema: tenderCreateSchema,
  patchSchema: tenderPatchSchema
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;