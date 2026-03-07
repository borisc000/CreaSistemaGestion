export const ENTITY_COLLECTION_KEYS = [
  "tenders",
  "contracts",
  "operationTasks",
  "financeEntries",
  "vacancies",
  "candidates",
  "peopleRecords",
  "personDocuments",
  "personContractAssignments",
  "accreditationTemplates"
] as const;

export type CollectionKey = (typeof ENTITY_COLLECTION_KEYS)[number];

export const AUX_COLLECTION_KEYS = ["alerts", "auditLogs"] as const;

export type AuxiliaryCollectionKey = (typeof AUX_COLLECTION_KEYS)[number];
export type TenantCollectionKey = CollectionKey | AuxiliaryCollectionKey;
