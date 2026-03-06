import { getModuleRelationSet, type ModuleKey, type RelationDefinition } from "@/modules/registry";
import { ApiError } from "@/server/api/response";
import { getEntity } from "@/server/repositories/firestore-repository";
import type { CollectionKey } from "@/types/collections";

export type RelationValidationMode = "create" | "patch";

type RelationValidationOptions = {
  tenantId: string;
  payload: Record<string, unknown>;
  relations: RelationDefinition[];
  mode: RelationValidationMode;
  exists?: (tenantId: string, collectionKey: CollectionKey, id: string) => Promise<boolean>;
};

type ModuleRelationValidationOptions = {
  tenantId: string;
  moduleKey: ModuleKey;
  payload: Record<string, unknown>;
  mode: RelationValidationMode;
  relationSet?: string;
  exists?: (tenantId: string, collectionKey: CollectionKey, id: string) => Promise<boolean>;
};

const defaultExistsResolver = async (tenantId: string, collectionKey: CollectionKey, id: string): Promise<boolean> => {
  const entity = await getEntity(tenantId, collectionKey, id);
  return Boolean(entity);
};

async function assertEntityExists(
  tenantId: string,
  collectionKey: CollectionKey,
  entityId: string,
  exists: (tenantId: string, collectionKey: CollectionKey, id: string) => Promise<boolean>
): Promise<void> {
  const found = await exists(tenantId, collectionKey, entityId);
  if (!found) {
    throw new ApiError(400, `Referenced ${collectionKey} entity does not exist.`);
  }
}

export async function validateRelations({
  tenantId,
  payload,
  relations,
  mode,
  exists = defaultExistsResolver
}: RelationValidationOptions): Promise<void> {
  for (const relation of relations) {
    const hasField = Object.prototype.hasOwnProperty.call(payload, relation.field);
    if (mode === "patch" && !hasField) {
      continue;
    }

    const value = payload[relation.field];

    if (value === undefined || value === null || value === "") {
      if (relation.required) {
        throw new ApiError(400, `Field ${relation.field} is required.`);
      }
      continue;
    }

    if (typeof value !== "string") {
      throw new ApiError(400, `Field ${relation.field} must be a string id.`);
    }

    await assertEntityExists(tenantId, relation.targetCollection, value, exists);
  }
}

export async function validateModuleRelations({
  tenantId,
  moduleKey,
  payload,
  mode,
  relationSet = "default",
  exists
}: ModuleRelationValidationOptions): Promise<void> {
  const relations = getModuleRelationSet(moduleKey, relationSet);
  if (!relations.length) {
    return;
  }

  await validateRelations({
    tenantId,
    payload,
    relations,
    mode,
    exists
  });
}

export async function assertContractExists(tenantId: string, contractId: string | null) {
  if (!contractId) return;
  await assertEntityExists(tenantId, "contracts", contractId, defaultExistsResolver);
}

export async function assertTenderExists(tenantId: string, tenderId: string | null) {
  if (!tenderId) return;
  await assertEntityExists(tenantId, "tenders", tenderId, defaultExistsResolver);
}

export async function assertVacancyExists(tenantId: string, vacancyId: string) {
  await assertEntityExists(tenantId, "vacancies", vacancyId, defaultExistsResolver);
}

export async function assertPersonExists(tenantId: string, personId: string) {
  await assertEntityExists(tenantId, "peopleRecords", personId, defaultExistsResolver);
}
