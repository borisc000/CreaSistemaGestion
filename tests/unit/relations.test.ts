import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/server/api/response";
import { validateModuleRelations, validateRelations } from "../../src/server/validation/relations";

describe("relation validation", () => {
  it("fails when required relation is missing on create", async () => {
    await expect(
      validateRelations({
        tenantId: "t-1",
        mode: "create",
        payload: {},
        relations: [{ field: "contractId", targetCollection: "contracts", required: true }]
      })
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("skips optional relation when null", async () => {
    const exists = vi.fn(async () => true);

    await validateRelations({
      tenantId: "t-1",
      mode: "create",
      payload: { tenderId: null },
      relations: [{ field: "tenderId", targetCollection: "tenders", required: false }],
      exists
    });

    expect(exists).not.toHaveBeenCalled();
  });

  it("fails when relation id does not exist", async () => {
    await expect(
      validateRelations({
        tenantId: "t-1",
        mode: "create",
        payload: { contractId: "c-404" },
        relations: [{ field: "contractId", targetCollection: "contracts", required: true }],
        exists: async () => false
      })
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("does not validate untouched fields in patch mode", async () => {
    const exists = vi.fn(async () => true);

    await validateRelations({
      tenantId: "t-1",
      mode: "patch",
      payload: { status: "active" },
      relations: [{ field: "contractId", targetCollection: "contracts", required: true }],
      exists
    });

    expect(exists).not.toHaveBeenCalled();
  });

  it("uses module relation sets", async () => {
    const exists = vi.fn(async () => true);

    await validateModuleRelations({
      tenantId: "t-1",
      moduleKey: "hr_recruiting",
      relationSet: "candidates",
      mode: "create",
      payload: { vacancyId: "v-1" },
      exists
    });

    expect(exists).toHaveBeenCalledWith("t-1", "vacancies", "v-1");
  });
});
