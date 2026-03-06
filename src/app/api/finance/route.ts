import { buildCrudHandlers } from "@/server/api/crud";
import { assertContractExists } from "@/server/validation/relations";
import { financeCreateSchema, financePatchSchema } from "@/server/validation/schemas";

const handlers = buildCrudHandlers({
  moduleKey: "finance",
  collectionKey: "financeEntries",
  createSchema: financeCreateSchema,
  patchSchema: financePatchSchema,
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