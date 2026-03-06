import { z } from "zod";
import { EMPLOYMENT_STATUSES } from "@/types/catalogs";
import type { IntegrationDataset, IntegrationImportError, PersonPayrollLineItem } from "@/types/domain";

export type ImportPreviewResult<TItem> = {
  totalRows: number;
  validRows: TItem[];
  errors: IntegrationImportError[];
};

export type CanonicalPeopleRow = {
  idNumber: string;
  fullName: string;
  position: string;
  contractId: string | null;
  hireDate: string;
  employmentStatus: (typeof EMPLOYMENT_STATUSES)[number];
  sourceCandidateId: string | null;
};

export type CanonicalPayrollRow = {
  personRef: string;
  period: string;
  grossIncome: number;
  netIncome: number;
  currency: string;
  items: PersonPayrollLineItem[];
};

const peopleRowSchema = z.object({
  idNumber: z.string().min(3),
  fullName: z.string().min(2),
  position: z.string().min(2),
  contractId: z.string().nullable(),
  hireDate: z.string().min(8),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES),
  sourceCandidateId: z.string().nullable()
});

const payrollRowSchema = z.object({
  personRef: z.string().min(2),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  grossIncome: z.number().nonnegative(),
  netIncome: z.number().nonnegative(),
  currency: z.string().min(3),
  items: z.array(
    z.object({
      code: z.string().min(1),
      label: z.string().min(1),
      amount: z.number()
    })
  )
});

function parseCsvLine(line: string, delimiter: "," | ";"): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

type ParsedCsvRow = {
  rowNumber: number;
  values: Record<string, string>;
};

function parseCsv(content: string, delimiter: "," | ";"): ParsedCsvRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0], delimiter).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line, delimiter);
    const values = Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() || ""]));
    return {
      rowNumber: rowIndex + 2,
      values
    };
  });
}

function nullIfEmpty(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNumericField(value: string, rowNumber: number, fieldName: string): number {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Row ${rowNumber}: ${fieldName} must be numeric.`);
  }
  return parsed;
}

function parseItemsJson(value: string, rowNumber: number): PersonPayrollLineItem[] {
  if (!value || value.trim().length === 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`Row ${rowNumber}: itemsJson must be valid JSON.`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Row ${rowNumber}: itemsJson must be an array.`);
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Row ${rowNumber}: item ${index + 1} is invalid.`);
    }
    const item = entry as Record<string, unknown>;
    return {
      code: typeof item.code === "string" && item.code ? item.code : `ITEM-${index + 1}`,
      label: typeof item.label === "string" && item.label ? item.label : "Sin etiqueta",
      amount: typeof item.amount === "number" ? item.amount : Number(item.amount || 0)
    };
  });
}

function buildPeopleRow(row: ParsedCsvRow): CanonicalPeopleRow {
  const candidate = {
    idNumber: row.values.idnumber || row.values.rut || row.values.id || "",
    fullName: row.values.fullname || row.values.nombre || "",
    position: row.values.position || row.values.cargo || "",
    contractId: nullIfEmpty(row.values.contractid || row.values.contract || ""),
    hireDate: row.values.hiredate || row.values.fechaingreso || "",
    employmentStatus: (row.values.employmentstatus || row.values.estado || "").toLowerCase(),
    sourceCandidateId: nullIfEmpty(row.values.sourcecandidateid || "")
  };

  return peopleRowSchema.parse(candidate);
}

function buildPayrollRow(row: ParsedCsvRow): CanonicalPayrollRow {
  const candidate = {
    personRef: row.values.personref || row.values.personid || row.values.rut || "",
    period: row.values.period || row.values.periodo || "",
    grossIncome: parseNumericField(row.values.grossincome || row.values.haberes || "0", row.rowNumber, "grossIncome"),
    netIncome: parseNumericField(row.values.netincome || row.values.liquido || "0", row.rowNumber, "netIncome"),
    currency: (row.values.currency || "CLP").toUpperCase(),
    items: parseItemsJson(row.values.itemsjson || "", row.rowNumber)
  };

  return payrollRowSchema.parse(candidate);
}

function toImportError(rowNumber: number, error: unknown): IntegrationImportError {
  if (error instanceof z.ZodError) {
    return {
      row: rowNumber,
      code: "validation_error",
      message: error.issues.map((issue) => issue.message).join("; ")
    };
  }

  return {
    row: rowNumber,
    code: "invalid_row",
    message: error instanceof Error ? error.message : "Invalid row."
  };
}

export function buildImportPreview(
  dataset: IntegrationDataset,
  content: string,
  delimiter: "," | ";" = ","
): ImportPreviewResult<CanonicalPeopleRow | CanonicalPayrollRow> {
  const rows = parseCsv(content, delimiter);
  const validRows: Array<CanonicalPeopleRow | CanonicalPayrollRow> = [];
  const errors: IntegrationImportError[] = [];

  for (const row of rows) {
    try {
      if (dataset === "people") {
        validRows.push(buildPeopleRow(row));
      } else {
        validRows.push(buildPayrollRow(row));
      }
    } catch (error) {
      errors.push(toImportError(row.rowNumber, error));
    }
  }

  return {
    totalRows: rows.length,
    validRows,
    errors
  };
}
