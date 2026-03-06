import type {
  CANDIDATE_STAGES,
  CONTRACT_STATUSES,
  EMPLOYMENT_STATUSES,
  OPERATION_TASK_STATUSES,
  PERSON_DOCUMENT_STATUSES,
  TENDER_STATUSES,
  VACANCY_STATUSES
} from "@/types/catalogs";
import type { UserRole as AuthUserRole } from "@/types/auth";
import type { ModuleKey as RegistryModuleKey } from "@/modules/registry";

export type UserRole = AuthUserRole;
export type ModuleKey = RegistryModuleKey;

export type TenderStatus = (typeof TENDER_STATUSES)[number];
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export type OperationTaskStatus = (typeof OPERATION_TASK_STATUSES)[number];
export type VacancyStatus = (typeof VACANCY_STATUSES)[number];
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];
export type PersonDocumentStatus = (typeof PERSON_DOCUMENT_STATUSES)[number];

export interface TenantContext {
  tenantId: string;
  uid: string;
  role: UserRole;
  email: string | null;
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
  status: PersonDocumentStatus;
  expiryDate: string | null;
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
