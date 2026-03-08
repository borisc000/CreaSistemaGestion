export const TENDER_STATUSES = ["draft", "submitted", "won", "lost"] as const;
export const CONTRACT_STATUSES = ["planning", "active", "at_risk", "closed"] as const;
export const OPERATION_TASK_STATUSES = ["todo", "doing", "blocked", "done"] as const;
export const VACANCY_STATUSES = ["open", "paused", "closed"] as const;
export const CANDIDATE_STAGES = ["intake", "screening", "interview", "offer", "hired", "rejected"] as const;
export const EMPLOYMENT_STATUSES = ["active", "on_leave", "inactive"] as const;
export const PERSON_DOCUMENT_STATUSES = ["uploaded", "pending", "expiring", "expired"] as const;
export const PERSON_CONTRACT_ASSIGNMENT_STATUSES = ["active", "inactive"] as const;
export const ACCREDITATION_SCOPES = ["global", "client", "contract"] as const;
export const CORRESPONDENCE_TEMPLATE_STATUSES = ["active", "archived"] as const;
export const CORRESPONDENCE_DATA_SOURCE_TYPES = ["csv", "xlsx", "json"] as const;
export const CORRESPONDENCE_DATA_SOURCE_STATUSES = ["active", "archived"] as const;
export const CORRESPONDENCE_JOB_STATUSES = ["queued", "processing", "completed", "failed"] as const;
export const CORRESPONDENCE_OUTPUT_FORMATS = ["docx", "pdf"] as const;
export const CORRESPONDENCE_DELIMITERS = ["angle", "double_angle", "curly", "bracket", "question"] as const;

export const REQUIRED_PERSON_DOCUMENT_TYPES = ["Contrato", "Carnet"] as const;
