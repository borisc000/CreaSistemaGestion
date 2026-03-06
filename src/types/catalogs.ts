export const TENDER_STATUSES = ["draft", "submitted", "won", "lost"] as const;
export const CONTRACT_STATUSES = ["planning", "active", "at_risk", "closed"] as const;
export const OPERATION_TASK_STATUSES = ["todo", "doing", "blocked", "done"] as const;
export const VACANCY_STATUSES = ["open", "paused", "closed"] as const;
export const CANDIDATE_STAGES = ["intake", "screening", "interview", "offer", "hired", "rejected"] as const;
export const EMPLOYMENT_STATUSES = ["active", "on_leave", "inactive"] as const;
export const PERSON_DOCUMENT_STATUSES = ["uploaded", "pending", "expiring", "expired"] as const;

export const REQUIRED_PERSON_DOCUMENT_TYPES = ["Contrato", "Carnet"] as const;

export const MODULE_KEYS = [
  "dashboard",
  "tenders",
  "contracts",
  "operations",
  "finance",
  "hr_recruiting",
  "hr_people"
] as const;