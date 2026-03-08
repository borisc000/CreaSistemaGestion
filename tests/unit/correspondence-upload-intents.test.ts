import { describe, expect, it } from "vitest";
import { ApiError } from "@/server/api/response";
import { validateCorrespondenceUploadInput } from "@/server/domain/correspondence-upload-intents";

describe("correspondence upload intent validation", () => {
  it("accepts json data source with text/plain mime type", () => {
    expect(() =>
      validateCorrespondenceUploadInput({
        kind: "data_source",
        sourceType: "json",
        fileName: "datos.json",
        mimeType: "text/plain",
        sizeBytes: 1024
      })
    ).not.toThrow();
  });

  it("rejects data source extension mismatch", () => {
    expect(() =>
      validateCorrespondenceUploadInput({
        kind: "data_source",
        sourceType: "json",
        fileName: "datos.csv",
        mimeType: "application/json",
        sizeBytes: 1024
      })
    ).toThrowError(ApiError);
  });
});

