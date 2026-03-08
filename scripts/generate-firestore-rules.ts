import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MODULE_KEYS, getModuleDefinition } from "../src/modules/registry";
import { USER_ROLES, type UserRole } from "../src/types/auth";
import type { TenantCollectionKey } from "../src/types/collections";

type CollectionRolePolicy = {
  read: Set<UserRole>;
  write: Set<UserRole>;
};

const EXTRA_COLLECTION_POLICIES: Record<TenantCollectionKey, { read: UserRole[]; write: UserRole[] }> = {
  alerts: {
    read: ["platform_admin", "tenant_admin", "contract_manager", "finance", "hr"],
    write: []
  },
  auditLogs: {
    read: ["platform_admin", "tenant_admin"],
    write: []
  },
  tenders: {
    read: [],
    write: []
  },
  contracts: {
    read: [],
    write: []
  },
  operationTasks: {
    read: [],
    write: []
  },
  financeEntries: {
    read: [],
    write: []
  },
  vacancies: {
    read: [],
    write: []
  },
  candidates: {
    read: [],
    write: []
  },
  peopleRecords: {
    read: [],
    write: []
  },
  personDocuments: {
    read: [],
    write: []
  },
  personContractAssignments: {
    read: [],
    write: []
  },
  accreditationTemplates: {
    read: [],
    write: []
  }
};

function ensureCollection(matrix: Map<TenantCollectionKey, CollectionRolePolicy>, collectionKey: TenantCollectionKey) {
  if (!matrix.has(collectionKey)) {
    matrix.set(collectionKey, {
      read: new Set<UserRole>(),
      write: new Set<UserRole>()
    });
  }
  return matrix.get(collectionKey)!;
}

function buildCollectionAccessMatrix(): Map<TenantCollectionKey, CollectionRolePolicy> {
  const matrix = new Map<TenantCollectionKey, CollectionRolePolicy>();

  for (const moduleKey of MODULE_KEYS) {
    const moduleDefinition = getModuleDefinition(moduleKey);
    if (!moduleDefinition.enabled) continue;

    for (const collectionKey of moduleDefinition.collectionKeys) {
      const collectionPolicy = ensureCollection(matrix, collectionKey);

      for (const role of USER_ROLES) {
        const rolePolicy = moduleDefinition.accessPolicy[role];
        if (rolePolicy.read) {
          collectionPolicy.read.add(role);
        }
        if (rolePolicy.write) {
          collectionPolicy.write.add(role);
        }
      }
    }
  }

  for (const [collectionKey, policy] of Object.entries(EXTRA_COLLECTION_POLICIES) as Array<
    [TenantCollectionKey, { read: UserRole[]; write: UserRole[] }]
  >) {
    const collectionPolicy = ensureCollection(matrix, collectionKey);
    for (const role of policy.read) {
      collectionPolicy.read.add(role);
    }
    for (const role of policy.write) {
      collectionPolicy.write.add(role);
    }
  }

  return matrix;
}

function formatRoleArray(roles: UserRole[]): string {
  if (!roles.length) {
    return "[]";
  }

  return `[${roles.map((role) => `\"${role}\"`).join(", ")}]`;
}

function buildRuleBlock(matrix: Map<TenantCollectionKey, CollectionRolePolicy>, action: "read" | "write"): string {
  const entries = Array.from(matrix.entries()).sort(([left], [right]) => left.localeCompare(right));

  const lines = entries.map(([collectionKey, policy]) => {
    const roles = Array.from(policy[action]).sort();
    return `        (collection == \"${collectionKey}\" && hasRole(${formatRoleArray(roles)})) ||`;
  });

  if (!lines.length) {
    return "        false";
  }

  const last = lines.length - 1;
  lines[last] = lines[last].replace(/ \|\|$/, "");
  return lines.join("\n");
}

function buildRulesFileContent(): string {
  const matrix = buildCollectionAccessMatrix();
  const readBlock = buildRuleBlock(matrix, "read");
  const writeBlock = buildRuleBlock(matrix, "write");

  return `rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function role() {
      return signedIn() && request.auth.token.tenantRole is string
        ? request.auth.token.tenantRole
        : (
            signedIn() && request.auth.token.role == "admin"
              ? "tenant_admin"
              : (signedIn() && request.auth.token.role is string ? request.auth.token.role : "viewer")
          );
    }

    function platformRole() {
      return signedIn() && request.auth.token.platformRole is string
        ? request.auth.token.platformRole
        : (
            signedIn() && request.auth.token.role == "platform_admin"
              ? "platform_admin"
              : null
          );
    }

    function tenant() {
      return signedIn() && request.auth.token.tenantId is string ? request.auth.token.tenantId : null;
    }

    function sameTenant(tenantId) {
      return signedIn() && tenant() != null && tenantId == tenant();
    }

    function isPlatformAdmin() {
      return platformRole() == "platform_admin";
    }

    function hasRole(allowed) {
      return signedIn() && ((role() in allowed) || (platformRole() in allowed));
    }

    function canReadCollection(collection) {
      return (
${readBlock}
      );
    }

    function canWriteCollection(collection) {
      return (
${writeBlock}
      );
    }

    match /tenants/{tenantId}/{collection}/{docId} {
      allow read: if (sameTenant(tenantId) || isPlatformAdmin()) && canReadCollection(collection);
      allow create, update, delete: if (sameTenant(tenantId) || isPlatformAdmin()) && canWriteCollection(collection);
    }

    match /tenants/{tenantId} {
      allow read: if sameTenant(tenantId) || isPlatformAdmin();
      allow create, update, delete: if isPlatformAdmin();
    }

    match /tenantUsers/{docId} {
      allow read, create, update, delete: if isPlatformAdmin();
    }

    match /tenantInvitations/{docId} {
      allow read, create, update, delete: if isPlatformAdmin();
    }

    match /tenantDomains/{docId} {
      allow read, create, update, delete: if isPlatformAdmin();
    }
  }
}
`;
}

function main() {
  const outputPath = resolve(__dirname, "..", "firestore.rules");
  writeFileSync(outputPath, buildRulesFileContent(), "utf8");
  console.log(`firestore.rules generated at ${outputPath}`);
}

main();
