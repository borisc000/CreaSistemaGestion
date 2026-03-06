import { describe, expect, it } from "vitest";
import { deriveDocumentStatus } from "../../src/server/domain/document-status";

describe("deriveDocumentStatus", () => {
  const now = new Date("2026-03-06T00:00:00.000Z");

  it("returns uploaded when no expiry date exists", () => {
    expect(deriveDocumentStatus(null, now)).toBe("uploaded");
  });

  it("returns expiring when expiry is within 30 days", () => {
    expect(deriveDocumentStatus("2026-03-20", now)).toBe("expiring");
  });

  it("returns expired when date is in the past", () => {
    expect(deriveDocumentStatus("2026-02-10", now)).toBe("expired");
  });

  it("returns uploaded when expiry is later than 30 days", () => {
    expect(deriveDocumentStatus("2026-05-10", now)).toBe("uploaded");
  });
});
