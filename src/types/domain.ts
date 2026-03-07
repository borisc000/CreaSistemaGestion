import type {
  CANDIDATE_STAGES,
  CONTRACT_STATUSES,
  ACCREDITATION_SCOPES,
  EMPLOYMENT_STATUSES,
  OPERATION_TASK_STATUSES,
  PERSON_CONTRACT_ASSIGNMENT_STATUSES,
  PERSON_DOCUMENT_STATUSES,
  TENDER_STATUSES,
  VACANCY_STATUSES
} from "@/types/catalogs";
import type { UserRole as AuthUserRole } from "@/types/auth";
import type { ModuleKey as RegistryModuleKey } from "@/modules/registry";

export type UserRole = AuthUserRole;
export type TenantScopedRole = Exclude<UserRole, "platform_admin">;
export type ModuleKey = RegistryModuleKey;

export type TenderStatus = (typeof TENDER_STATUSES)[number];
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export type OperationTaskStatus = (typeof OPERATION_TASK_STATUSES)[number];
export type VacancyStatus = (typeof VACANCY_STATUSES)[number];
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];
export type PersonDocumentStatus = (typeof PERSON_DOCUMENT_STATUSES)[number];
export type PersonContractAssignmentStatus = (typeof PERSON_CONTRACT_ASSIGNMENT_STATUSES)[number];
export type AccreditationScope = (typeof ACCREDITATION_SCOPES)[number];

export interface TenantContext {
  tenantId: string;
  uid: string;
  role: UserRole;
  email: string | null;
  tenantRole?: UserRole | null;
  platformRole?: "platform_admin" | null;
  host?: string | null;
}

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tender extends BaseEntity {
  title: string;
  client: string;
  amount: number;
  closeDate: string;
  probability: number;
  responsible: string;
  status: TenderStatus;
}

export interface Contract extends BaseEntity {
  tenderId: string | null;
  name: string;
  client: string;
  totalValue: number;
  costEstimate: number;
  startDate: string;
  endDate: string;
  manager: string;
  status: ContractStatus;
  progress: number;
}

export interface OperationTask extends BaseEntity {
  contractId: string;
  title: string;
  owner: string;
  priority: "low" | "medium" | "high";
  dueDate: string;
  status: OperationTaskStatus;
}

export interface FinanceEntry extends BaseEntity {
  contractId: string;
  type: "income" | "expense";
  concept: string;
  category: string;
  amount: number;
  dueDate: string;
  status: "pending" | "paid";
}

export interface Vacancy extends BaseEntity {
  title: string;
  area: string;
  contractId: string | null;
  openings: number;
  targetDate: string | null;
  status: VacancyStatus;
}

export interface Candidate extends BaseEntity {
  vacancyId: string;
  name: string;
  source: string;
  salary: number;
  stage: CandidateStage;
  hiredAt: string | null;
  personRecordId?: string | null;
}

export interface PersonRecord extends BaseEntity {
  fullName: string;
  idNumber: string;
  rutNormalized?: string | null;
  position: string;
  contractId: string | null;
  hireDate: string;
  employmentStatus: EmploymentStatus;
  sourceCandidateId?: string | null;
}

export interface PersonDocument extends BaseEntity {
  personId: string;
  docType: string;
  fileName: string;
  filePath: string;
  templateCode?: string | null;
  scope?: AccreditationScope;
  clientName?: string | null;
  contractId?: string | null;
  validFrom?: string | null;
  reusable?: boolean;
  status: PersonDocumentStatus;
  expiryDate: string | null;
}

export interface PersonContractAssignment extends BaseEntity {
  personId: string;
  contractId: string;
  startDate: string;
  endDate: string | null;
  status: PersonContractAssignmentStatus;
}

export interface AccreditationTemplate extends BaseEntity {
  code: string;
  name: string;
  scope: AccreditationScope;
  clientName: string | null;
  contractId: string | null;
  required: boolean;
  validityDays: number | null;
  enabled: boolean;
  sortOrder: number;
}

export type AccreditationRequirementStatus = "pending" | "expired" | "compliant" | "reused";

export interface AccreditationRequirementResult {
  template: AccreditationTemplate;
  status: AccreditationRequirementStatus;
  evidenceDocumentId: string | null;
  evidenceFileName: string | null;
  evidenceScope: AccreditationScope | null;
  evidenceExpiryDate: string | null;
}

export interface PersonPayrollLineItem {
  code: string;
  label: string;
  amount: number;
}

export interface PersonPayrollRecord extends BaseEntity {
  personId: string;
  period: string;
  grossIncome: number;
  netIncome: number;
  currency: string;
  source: string;
  items: PersonPayrollLineItem[];
}

export interface DashboardKpis {
  openTenders: number;
  activeContracts: number;
  riskContracts: number;
  blockedTasks: number;
  monthNetFlow: number;
  openVacancies: number;
  activeCandidates: number;
  expiredDocuments: number;
}

export interface AdminUserSummary {
  uid: string;
  email: string | null;
  displayName: string | null;
  disabled: boolean;
  lastSignInTime: string | null;
  role: TenantScopedRole;
  tenantId: string | null;
  status?: TenantUserStatus;
}

export type TenantStatus = "active" | "suspended";
export type TenantUserStatus = "active" | "invited" | "revoked";
export type TenantInvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type TenantDomainType = "wildcard" | "custom";
export type BillingPlanCode = "starter" | "pro" | "enterprise";

export interface TenantPlan {
  code: BillingPlanCode;
  status: "active" | "inactive";
  limits: {
    maxUsers: number;
    enabledModules: ModuleKey[];
  };
}

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: TenantPlan;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantUserMembership {
  id: string;
  tenantId: string;
  uid: string;
  email: string;
  role: TenantScopedRole;
  status: TenantUserStatus;
  invitedByUid: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantInvitation {
  id: string;
  tenantId: string;
  email: string;
  role: TenantScopedRole;
  status: TenantInvitationStatus;
  expiresAt: string;
  invitedByUid: string;
  tokenHash: string;
  createdAt: string;
  updatedAt: string;
  acceptedByUid: string | null;
  acceptedAt: string | null;
}

export interface TenantDomain {
  id: string;
  tenantId: string;
  host: string;
  type: TenantDomainType;
  verified: boolean;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

export interface UserTenantMembershipView {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: TenantStatus;
  membershipRole: TenantScopedRole;
  membershipStatus: TenantUserStatus;
  preferredHost: string | null;
}

export interface AuditActorInfo {
  uid: string | null;
  email: string | null;
  role: UserRole | null;
  source: "user" | "system";
}

export interface AuditLogEntry {
  id: string;
  module: string;
  collection: string;
  entityId: string;
  eventType: "created" | "updated" | "deleted";
  createdAt: string;
  actor: AuditActorInfo;
  changedFields: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}
