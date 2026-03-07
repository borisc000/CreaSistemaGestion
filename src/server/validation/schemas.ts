import { z } from "zod";
import {
  ACCREDITATION_SCOPES,
  CANDIDATE_STAGES,
  CONTRACT_STATUSES,
  EMPLOYMENT_STATUSES,
  OPERATION_TASK_STATUSES,
  PERSON_CONTRACT_ASSIGNMENT_STATUSES,
  PERSON_DOCUMENT_STATUSES,
  TENDER_STATUSES,
  VACANCY_STATUSES
} from "@/types/catalogs";

const idSchema = z.string().min(3);
const isoDateSchema = z.string().min(8);
const optionalTextSchema = z.string().trim().min(1).nullable().optional();
const optionalIsoDateSchema = z.string().min(8).nullable().optional();
const optionalMoneySchema = z.number().nonnegative().nullable().optional();

export const tenderCreateSchema = z.object({
  title: z.string().min(2),
  client: z.string().min(2),
  amount: z.number().nonnegative(),
  closeDate: isoDateSchema,
  probability: z.number().min(0).max(100),
  responsible: z.string().min(2),
  status: z.enum(TENDER_STATUSES)
});

export const tenderPatchSchema = tenderCreateSchema.partial().extend({ id: idSchema });

export const contractCreateSchema = z.object({
  tenderId: z.string().nullable(),
  name: z.string().min(2),
  client: z.string().min(2),
  totalValue: z.number().nonnegative(),
  costEstimate: z.number().nonnegative(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  manager: z.string().min(2),
  status: z.enum(CONTRACT_STATUSES),
  progress: z.number().min(0).max(100)
});

export const contractPatchSchema = contractCreateSchema.partial().extend({ id: idSchema });

export const operationCreateSchema = z.object({
  contractId: z.string().min(3),
  title: z.string().min(2),
  owner: z.string().min(2),
  priority: z.enum(["low", "medium", "high"]),
  dueDate: isoDateSchema,
  status: z.enum(OPERATION_TASK_STATUSES)
});

export const operationPatchSchema = operationCreateSchema.partial().extend({ id: idSchema });

export const financeCreateSchema = z.object({
  contractId: z.string().min(3),
  type: z.enum(["income", "expense"]),
  concept: z.string().min(2),
  category: z.string().min(2),
  amount: z.number().nonnegative(),
  dueDate: isoDateSchema,
  status: z.enum(["pending", "paid"])
});

export const financePatchSchema = financeCreateSchema.partial().extend({ id: idSchema });

export const vacancyCreateSchema = z.object({
  title: z.string().min(2),
  area: z.string().min(2),
  contractId: z.string().nullable(),
  openings: z.number().int().positive(),
  targetDate: z.string().nullable(),
  status: z.enum(VACANCY_STATUSES)
});

export const vacancyPatchSchema = vacancyCreateSchema.partial().extend({ id: idSchema });

export const candidateCreateSchema = z.object({
  vacancyId: z.string().min(3),
  name: z.string().min(2),
  source: z.string().min(2),
  salary: z.number().nonnegative(),
  stage: z.enum(CANDIDATE_STAGES),
  hiredAt: z.string().nullable().optional(),
  personRecordId: z.string().nullable().optional()
});

export const candidatePatchSchema = candidateCreateSchema.partial().extend({ id: idSchema });

export const personRecordCreateSchema = z.object({
  fullName: z.string().min(2),
  idNumber: z.string().min(5),
  position: z.string().min(2),
  contractId: z.string().nullable(),
  hireDate: isoDateSchema,
  employmentStatus: z.enum(EMPLOYMENT_STATUSES),
  sourceCandidateId: z.string().nullable().optional(),
  email: optionalTextSchema,
  phone: optionalTextSchema,
  birthDate: optionalIsoDateSchema,
  nationality: optionalTextSchema,
  maritalStatus: optionalTextSchema,
  addressLine: optionalTextSchema,
  district: optionalTextSchema,
  city: optionalTextSchema,
  country: optionalTextSchema,
  jobFunction: optionalTextSchema,
  employmentType: optionalTextSchema,
  contractEndDate: optionalIsoDateSchema,
  workSchedule: optionalTextSchema,
  workHours: optionalTextSchema,
  externalCode: optionalTextSchema,
  purchaseOrder: optionalTextSchema,
  healthProvider: optionalTextSchema,
  pensionFund: optionalTextSchema,
  baseSalary: optionalMoneySchema,
  mealAllowance: optionalMoneySchema,
  transportAllowance: optionalMoneySchema,
  otherBonuses: optionalMoneySchema
});

export const personRecordPatchSchema = personRecordCreateSchema.partial().extend({ id: idSchema });

export const personDocumentCreateSchema = z.object({
  personId: z.string().min(3),
  docType: z.string().min(2),
  fileName: z.string().min(2),
  filePath: z.string().min(2).optional(),
  templateCode: z.string().min(2).nullable().optional(),
  scope: z.enum(ACCREDITATION_SCOPES).optional(),
  clientName: z.string().min(2).nullable().optional(),
  contractId: z.string().nullable().optional(),
  validFrom: z.string().nullable().optional(),
  reusable: z.boolean().optional(),
  status: z.enum(PERSON_DOCUMENT_STATUSES).optional(),
  expiryDate: z.string().nullable().optional()
});

export const personDocumentPatchSchema = personDocumentCreateSchema.partial().extend({ id: idSchema });

export const personContractAssignmentCreateSchema = z.object({
  personId: z.string().min(3),
  contractId: z.string().min(3),
  startDate: isoDateSchema,
  endDate: z.string().nullable().optional(),
  status: z.enum(PERSON_CONTRACT_ASSIGNMENT_STATUSES).optional()
});

export const personContractAssignmentPatchSchema = personContractAssignmentCreateSchema.partial().extend({ id: idSchema });

export const accreditationTemplateCreateSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  scope: z.enum(ACCREDITATION_SCOPES),
  clientName: z.string().nullable().optional(),
  contractId: z.string().nullable().optional(),
  required: z.boolean().default(true),
  validityDays: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().nonnegative().default(100)
});

export const accreditationTemplatePatchSchema = accreditationTemplateCreateSchema.partial().extend({ id: idSchema });
