import { USER_ROLES, type UserRole } from "@/types/auth";
import type { CollectionKey } from "@/types/collections";

export type AccessAction = "read" | "write";

export type AccessPolicy = Record<UserRole, Record<AccessAction, boolean>>;

export type RelationDefinition = {
  field: string;
  targetCollection: CollectionKey;
  required?: boolean;
  label?: string;
};

export type RelationSetMap = Record<string, RelationDefinition[]>;

export type DashboardMetricKey =
  | "openTenders"
  | "activeContracts"
  | "riskContracts"
  | "blockedTasks"
  | "monthNetFlow"
  | "openVacancies"
  | "activeCandidates"
  | "expiredDocuments";

export type ModuleNavigation = {
  label: string;
  href: string;
  order: number;
  groupLabel?: string;
  groupHref?: string;
  groupOrder?: number;
  visibleForRoles?: UserRole[];
};

export type ModuleDefinition = {
  moduleKey: string;
  label: string;
  route: string;
  apiBase: string;
  collectionKeys: CollectionKey[];
  primaryCollection?: CollectionKey;
  enabled: boolean;
  accessPolicy: AccessPolicy;
  relations?: RelationSetMap;
  dashboardContributors?: DashboardMetricKey[];
  navigation?: ModuleNavigation;
};

function buildAccessPolicy(readRoles: UserRole[], writeRoles: UserRole[]): AccessPolicy {
  const readSet = new Set<UserRole>([...readRoles, ...writeRoles]);
  const writeSet = new Set<UserRole>(writeRoles);

  return Object.fromEntries(
    USER_ROLES.map((role) => [
      role,
      {
        read: readSet.has(role),
        write: writeSet.has(role)
      }
    ])
  ) as AccessPolicy;
}

const DASHBOARD_METRICS: DashboardMetricKey[] = [
  "openTenders",
  "activeContracts",
  "riskContracts",
  "blockedTasks",
  "monthNetFlow",
  "openVacancies",
  "activeCandidates",
  "expiredDocuments"
];

const MODULE_REGISTRY_INTERNAL = {
  dashboard: {
    moduleKey: "dashboard",
    label: "Dashboard",
    route: "/dashboard",
    apiBase: "/api/dashboard",
    collectionKeys: [],
    enabled: true,
    accessPolicy: buildAccessPolicy([...USER_ROLES], []),
    dashboardContributors: DASHBOARD_METRICS,
    navigation: {
      label: "Dashboard",
      href: "/dashboard",
      order: 10,
      visibleForRoles: [...USER_ROLES]
    }
  },
  tenders: {
    moduleKey: "tenders",
    label: "Licitaciones",
    route: "/licitaciones",
    apiBase: "/api/tenders",
    collectionKeys: ["tenders"],
    primaryCollection: "tenders",
    enabled: true,
    accessPolicy: buildAccessPolicy(["admin", "tender_lead", "contract_manager"], ["admin", "tender_lead"]),
    relations: {
      default: []
    },
    dashboardContributors: ["openTenders"],
    navigation: {
      label: "Licitaciones",
      href: "/licitaciones",
      order: 20,
      visibleForRoles: ["admin", "tender_lead"]
    }
  },
  contracts: {
    moduleKey: "contracts",
    label: "Contratos",
    route: "/contratos",
    apiBase: "/api/contracts",
    collectionKeys: ["contracts"],
    primaryCollection: "contracts",
    enabled: true,
    accessPolicy: buildAccessPolicy(
      ["admin", "tender_lead", "contract_manager", "finance", "hr"],
      ["admin", "tender_lead", "contract_manager"]
    ),
    relations: {
      default: [
        {
          field: "tenderId",
          targetCollection: "tenders",
          required: false,
          label: "tender"
        }
      ]
    },
    dashboardContributors: ["activeContracts", "riskContracts"],
    navigation: {
      label: "Contratos",
      href: "/contratos",
      order: 30,
      visibleForRoles: ["admin", "tender_lead", "contract_manager"]
    }
  },
  operations: {
    moduleKey: "operations",
    label: "Operaciones",
    route: "/operaciones",
    apiBase: "/api/operations",
    collectionKeys: ["operationTasks"],
    primaryCollection: "operationTasks",
    enabled: true,
    accessPolicy: buildAccessPolicy(["admin", "contract_manager"], ["admin", "contract_manager"]),
    relations: {
      default: [
        {
          field: "contractId",
          targetCollection: "contracts",
          required: true,
          label: "contract"
        }
      ]
    },
    dashboardContributors: ["blockedTasks"],
    navigation: {
      label: "Operaciones",
      href: "/operaciones",
      order: 40,
      visibleForRoles: ["admin", "contract_manager"]
    }
  },
  finance: {
    moduleKey: "finance",
    label: "Finanzas",
    route: "/finanzas",
    apiBase: "/api/finance",
    collectionKeys: ["financeEntries"],
    primaryCollection: "financeEntries",
    enabled: true,
    accessPolicy: buildAccessPolicy(["admin", "finance"], ["admin", "finance"]),
    relations: {
      default: [
        {
          field: "contractId",
          targetCollection: "contracts",
          required: true,
          label: "contract"
        }
      ]
    },
    dashboardContributors: ["monthNetFlow"],
    navigation: {
      label: "Finanzas",
      href: "/finanzas",
      order: 50,
      visibleForRoles: ["admin", "finance"]
    }
  },
  hr_recruiting: {
    moduleKey: "hr_recruiting",
    label: "RRHH - Reclutamiento",
    route: "/rrhh/reclutamiento",
    apiBase: "/api/hr/recruiting",
    collectionKeys: ["vacancies", "candidates"],
    enabled: true,
    accessPolicy: buildAccessPolicy(["admin", "hr"], ["admin", "hr"]),
    relations: {
      vacancies: [
        {
          field: "contractId",
          targetCollection: "contracts",
          required: false,
          label: "contract"
        }
      ],
      candidates: [
        {
          field: "vacancyId",
          targetCollection: "vacancies",
          required: true,
          label: "vacancy"
        }
      ]
    },
    dashboardContributors: ["openVacancies", "activeCandidates"],
    navigation: {
      label: "Reclutamiento y seleccion",
      href: "/rrhh/reclutamiento",
      order: 70,
      groupLabel: "RRHH",
      groupHref: "/rrhh",
      groupOrder: 60,
      visibleForRoles: ["admin", "hr"]
    }
  },
  hr_people: {
    moduleKey: "hr_people",
    label: "RRHH - Gestion de personas",
    route: "/rrhh/personas",
    apiBase: "/api/hr/people",
    collectionKeys: ["peopleRecords", "personDocuments"],
    primaryCollection: "peopleRecords",
    enabled: true,
    accessPolicy: buildAccessPolicy(["admin", "hr"], ["admin", "hr"]),
    relations: {
      peopleRecords: [
        {
          field: "contractId",
          targetCollection: "contracts",
          required: false,
          label: "contract"
        }
      ],
      personDocuments: [
        {
          field: "personId",
          targetCollection: "peopleRecords",
          required: true,
          label: "person"
        }
      ]
    },
    dashboardContributors: ["expiredDocuments"],
    navigation: {
      label: "Gestion de personas",
      href: "/rrhh/personas",
      order: 80,
      groupLabel: "RRHH",
      groupHref: "/rrhh",
      groupOrder: 60,
      visibleForRoles: ["admin", "hr"]
    }
  }
} satisfies Record<string, ModuleDefinition>;

export type ModuleKey = keyof typeof MODULE_REGISTRY_INTERNAL;
export type RegisteredModule = ModuleDefinition;

export const MODULE_REGISTRY: Record<ModuleKey, ModuleDefinition> = MODULE_REGISTRY_INTERNAL;
export const MODULE_KEYS = Object.keys(MODULE_REGISTRY_INTERNAL) as ModuleKey[];

export function getModuleDefinition(moduleKey: ModuleKey): RegisteredModule {
  return MODULE_REGISTRY[moduleKey];
}

export function getEnabledModules(): RegisteredModule[] {
  return MODULE_KEYS.map((moduleKey) => MODULE_REGISTRY[moduleKey]).filter((moduleDefinition) => moduleDefinition.enabled);
}

export function getModuleRelationSet(moduleKey: ModuleKey, relationSet = "default"): RelationDefinition[] {
  const definition = getModuleDefinition(moduleKey);
  return definition.relations?.[relationSet] || [];
}

export function resolveModuleKeyFromPath(pathname: string): ModuleKey | null {
  const candidates = getEnabledModules()
    .map((moduleDefinition) => ({ moduleKey: moduleDefinition.moduleKey as ModuleKey, route: moduleDefinition.route }))
    .sort((left, right) => right.route.length - left.route.length);

  for (const candidate of candidates) {
    if (pathname === candidate.route || pathname.startsWith(`${candidate.route}/`)) {
      return candidate.moduleKey;
    }
  }

  return null;
}
