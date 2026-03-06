import { buildCrudHandlers } from "@/server/api/crud";
import { assertContractExists } from "@/server/validation/relations";
import { operationCreateSchema, operationPatchSchema } from "@/server/validation/schemas";

const handlers = buildCrudHandlers({
  moduleKey: "operations",
  collectionKey: "operationTasks",
  createSchema: operationCreateSchema,
  patchSchema: operationPatchSchema,
  beforeCreate: async ({ tenantId, createPayload }) => {
    if (!createPayload) return;
    await assertContractExists(tenantId, createPayload.contractId);
  },
  beforePatch: async ({ tenantId, patchPayload }) => {
    if (!patchPayload) return;
    await assertContractExists(tenantId, patchPayload.contractId ?? null);
  }
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;