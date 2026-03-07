import { describe, expect, it } from "vitest";
import { computeChangedFields, resolveAuditActor } from "../../src/server/domain/audit";

describe("audit helpers", () => {
  it("computes changed fields ignoring metadata", () => {
    const changed = computeChangedFields(
      {
        status: "draft",
        amount: 100,
        updatedAt: "2026-03-05T00:00:00.000Z"
      },
      {
        status: "submitted",
        amount: 100,
        updatedAt: "2026-03-06T00:00:00.000Z"
      }
    );

    expect(changed).toEqual(["status"]);
  });

  it("resolves actor from write metadata", () => {
    const actor = resolveAuditActor(null, {
      updatedByUid: "u-1",
      updatedByEmail: "admin@acme.com",
      updatedByRole: "tenant_admin"
    });

    expect(actor).toEqual({
      uid: "u-1",
      email: "admin@acme.com",
      role: "tenant_admin",
      source: "user"
    });
  });

  it("returns system actor when metadata is missing", () => {
    const actor = resolveAuditActor({}, {});
    expect(actor.source).toBe("system");
    expect(actor.uid).toBeNull();
  });
});
