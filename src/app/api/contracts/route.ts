import { buildCrudHandlers } from "@/server/api/crud";
import { assertTenderExists } from "@/server/validation/relations";
import { contractCreateSchema, contractPatchSchema } from "@/server/validation/schemas";

const handlers = buildCrudHandlers({
  moduleKey: "contracts",
  collectionKey: "contracts",
  createSchema: contractCreateSchema,
  patchSchema: contractPatchSchema,
  beforeCreate: async ({ tenantId, createPayload }) => {
    if (!createPayload) return;
    await assertTenderExists(tenantId, createPayload.tenderId);
  },
  beforePatch: async ({ tenantId, patchPayload }) => {
    if (!patchPayload) return;
    await assertTenderExists(tenantId, patchPayload.tenderId ?? null);
  }
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;