import { describe, expect, it } from "vitest";
import type { UserRecord } from "firebase-admin/auth";
import { filterAdminUsers, normalizeAdminUser } from "../../src/server/domain/admin-users";

function buildUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    uid: "uid-1",
    email: "admin@example.com",
    displayName: "Admin User",
    disabled: false,
    customClaims: {
      role: "admin",
      tenantId: "tenant-a"
    },
    metadata: {
      creationTime: "2026-03-01T00:00:00.000Z",
      lastSignInTime: "2026-03-06T00:00:00.000Z",
      lastRefreshTime: "2026-03-06T01:00:00.000Z",
      toJSON: () => ({})
    },
    providerData: [],
    tenantId: null,
    emailVerified: true,
    phoneNumber: null,
    photoURL: null,
    passwordHash: undefined,
    passwordSalt: undefined,
    toJSON: () => ({}),
    ...overrides
  } as unknown as UserRecord;
}

describe("admin user normalization", () => {
  it("normalizes firebase user record into UI-friendly shape", () => {
    const normalized = normalizeAdminUser(buildUserRecord());
    expect(normalized.uid).toBe("uid-1");
    expect(normalized.role).toBe("admin");
    expect(normalized.tenantId).toBe("tenant-a");
    expect(normalized.lastSignInTime).toBe("2026-03-06T00:00:00.000Z");
  });

  it("falls back to viewer role when claim is missing", () => {
    const normalized = normalizeAdminUser(
      buildUserRecord({
        customClaims: {}
      })
    );
    expect(normalized.role).toBe("viewer");
  });

  it("filters by query, role and tenant", () => {
    const users = [
      normalizeAdminUser(
        buildUserRecord({
          uid: "u-admin",
          email: "admin@acme.com",
          customClaims: { role: "admin", tenantId: "tenant-a" }
        })
      ),
      normalizeAdminUser(
        buildUserRecord({
          uid: "u-hr",
          email: "hr@acme.com",
          customClaims: { role: "hr", tenantId: "tenant-b" }
        })
      )
    ];

    const filtered = filterAdminUsers(users, { q: "admin", role: "admin", tenantId: "tenant-a" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].uid).toBe("u-admin");
  });
});
