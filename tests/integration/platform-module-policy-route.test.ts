import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/server/api/response";

vi.mock("@/server/auth/request-context", () => ({
  getTenantContext: vi.fn()
}));

vi.mock("@/server/auth/module-policy", () => ({
  assertValidModulePolicyPayload: vi.fn((payload: unknown) => {
    if (!payload || typeof payload !== "object" || !("modules" in payload)) {
      throw new ApiError(400, "modules is required.");
    }
  }),
  getModulePolicySnapshot: vi.fn(),
  patchModulePolicySnapshot: vi.fn()
}));

import { GET, PATCH } from "@/app/api/platform/settings/module-policy/route";
import { getTenantContext } from "@/server/auth/request-context";
import {
  assertValidModulePolicyPayload,
  getModulePolicySnapshot,
  patchModulePolicySnapshot
} from "@/server/auth/module-policy";

describe("/api/platform/settings/module-policy route", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("returns module policy for platform_admin", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "platform-global",
      uid: "platform-1",
      role: "platform_admin",
      email: "platform@acme.com",
      platformRole: "platform_admin"
    } as never);
    vi.mocked(getModulePolicySnapshot).mockResolvedValue({
      modules: {} as never,
      updatedAt: "2026-03-08T00:00:00.000Z",
      updatedByUid: "platform-1"
    });

    const req = new NextRequest("http://localhost/api/platform/settings/module-policy");
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.updatedByUid).toBe("platform-1");
  });

  it("updates module policy", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "platform-global",
      uid: "platform-1",
      role: "platform_admin",
      email: "platform@acme.com",
      platformRole: "platform_admin"
    } as never);
    vi.mocked(patchModulePolicySnapshot).mockResolvedValue({
      modules: {} as never,
      updatedAt: "2026-03-08T00:00:00.000Z",
      updatedByUid: "platform-1"
    });

    const req = new NextRequest("http://localhost/api/platform/settings/module-policy", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modules: {
          dashboard: {}
        }
      })
    });
    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(vi.mocked(patchModulePolicySnapshot)).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUid: "platform-1"
      })
    );
  });

  it("returns 400 when modules payload is missing", async () => {
    vi.mocked(getTenantContext).mockResolvedValue({
      tenantId: "platform-global",
      uid: "platform-1",
      role: "platform_admin",
      email: "platform@acme.com",
      platformRole: "platform_admin"
    } as never);
    vi.mocked(assertValidModulePolicyPayload).mockImplementationOnce(() => {
      throw new ApiError(400, "modules is required.");
    });

    const req = new NextRequest("http://localhost/api/platform/settings/module-policy", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invalid: true })
    });
    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("modules is required");
  });
});
