import { describe, expect, it } from "vitest";
import { isPendingIdNumber, normalizeRut, tryNormalizeRut } from "../../src/server/domain/rut";

describe("rut helpers", () => {
  it("normalizes a valid rut into canonical format", () => {
    expect(normalizeRut("12.345.678-5")).toBe("12345678-5");
    expect(normalizeRut("12345678-5")).toBe("12345678-5");
  });

  it("rejects invalid rut values", () => {
    expect(() => normalizeRut("12.345.678-9")).toThrowError();
    expect(tryNormalizeRut("12.345.678-9")).toBeNull();
  });

  it("detects pending placeholders", () => {
    expect(isPendingIdNumber("pending-abc123")).toBe(true);
    expect(isPendingIdNumber("12345678-5")).toBe(false);
  });
});
