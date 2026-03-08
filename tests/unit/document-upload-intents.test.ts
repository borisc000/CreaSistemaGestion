import { describe, expect, it } from "vitest";
import { ApiError } from "@/server/api/response";
import { MAX_DOCUMENT_UPLOAD_BYTES, validateDocumentUploadInput } from "@/server/domain/document-upload-intents";

describe("document upload intent validation", () => {
  it("accepts allowed mime/ext and size", () => {
    expect(() =>
      validateDocumentUploadInput({
        fileName: "archivo.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024
      })
    ).not.toThrow();
  });

  it("rejects unsupported mime type", () => {
    expect(() =>
      validateDocumentUploadInput({
        fileName: "archivo.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 1024
      })
    ).toThrowError(ApiError);
  });

  it("rejects extension mismatch", () => {
    expect(() =>
      validateDocumentUploadInput({
        fileName: "foto.png",
        mimeType: "application/pdf",
        sizeBytes: 1024
      })
    ).toThrowError(ApiError);
  });

  it("rejects oversize files", () => {
    expect(() =>
      validateDocumentUploadInput({
        fileName: "archivo.pdf",
        mimeType: "application/pdf",
        sizeBytes: MAX_DOCUMENT_UPLOAD_BYTES + 1
      })
    ).toThrowError(ApiError);
  });
});

