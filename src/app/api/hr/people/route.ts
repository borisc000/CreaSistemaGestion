import { buildCrudHandlers } from "@/server/api/crud";
import { personRecordCreateSchema, personRecordPatchSchema } from "@/server/validation/schemas";

const handlers = buildCrudHandlers({
  moduleKey: "hr_people",
  collectionKey: "peopleRecords",
  relationSet: "peopleRecords",
  createSchema: personRecordCreateSchema,
  patchSchema: personRecordPatchSchema
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
