import { describe, expect, it } from "vitest";
import { ApiError, jsonError } from "@/server/api/response";

describe("jsonError", () => {
  it("returns original message for 4xx ApiError", async () => {
    const response = jsonError(new ApiError(403, "forbidden"));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: "forbidden" });
  });

  it("sanitizes 5xx ApiError and includes requestId", async () => {
    const response = jsonError(new ApiError(502, "upstream details"));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error).toBe("Unexpected server error.");
    expect(typeof payload.requestId).toBe("string");
    expect(payload.requestId.length).toBeGreaterThan(10);
  });

  it("sanitizes unknown errors and includes requestId", async () => {
    const response = jsonError(new Error("secret stack"));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe("Unexpected server error.");
    expect(typeof payload.requestId).toBe("string");
  });
});

