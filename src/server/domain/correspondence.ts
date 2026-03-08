import Docxtemplater from "docxtemplater";
import JSZip from "jszip";
import PizZip from "pizzip";
import { parse as parseCsv } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { ApiError } from "@/server/api/response";
import { adminStorage } from "@/lib/firebase/admin";
import type {
  CorrespondenceDataSource,
  CorrespondenceDelimiter,
  CorrespondenceOutputFormat,
  CorrespondenceSourceType,
  CorrespondenceTemplate
} from "@/types/domain";

const DOCUMENT_XML_PATH = "word/document.xml";

type MergeRow = Record<string, string | number | boolean | null>;

type DelimiterPair = {
  start: string;
  end: string;
};

function resolveDelimiterPair(delimiter: CorrespondenceDelimiter): DelimiterPair {
  if (delimiter === "double_angle") return { start: "<<", end: ">>" };
  if (delimiter === "curly") return { start: "{{", end: "}}" };
  if (delimiter === "bracket") return { start: "[", end: "]" };
  return { start: "\u00ab", end: "\u00bb" };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeFileSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function downloadStorageFile(path: string): Promise<Buffer> {
  const bucket = adminStorage.bucket();
  const [buffer] = await bucket.file(path).download();
  return buffer;
}

export async function uploadStorageFile(path: string, buffer: Buffer, contentType: string): Promise<void> {
  const bucket = adminStorage.bucket();
  await bucket.file(path).save(buffer, {
    metadata: {
      contentType
    },
    resumable: false
  });
}

export function detectTemplateKeysFromDocx(buffer: Buffer, delimiter: CorrespondenceDelimiter): string[] {
  let documentXml = "";
  try {
    const zip = new PizZip(buffer);
    documentXml = zip.file(DOCUMENT_XML_PATH)?.asText() || "";
  } catch {
    throw new ApiError(400, "Template file is not a valid DOCX.");
  }

  if (!documentXml) {
    return [];
  }

  const plainText = extractWordVisibleText(documentXml);
  const pair = resolveDelimiterPair(delimiter);
  const keyRegex = new RegExp(`${escapeRegExp(pair.start)}\\s*([^\\r\\n${escapeRegExp(pair.end)}]+?)\\s*${escapeRegExp(pair.end)}`, "g");
  const keys = new Set<string>();
  let match: RegExpExecArray | null = keyRegex.exec(plainText);
  while (match) {
    const key = match[1]?.trim();
    if (key) {
      keys.add(key);
    }
    match = keyRegex.exec(plainText);
  }

  return Array.from(keys).sort((left, right) => left.localeCompare(right));
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function extractWordVisibleText(documentXml: string): string {
  const chunks = Array.from(documentXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)).map((match) => decodeXmlEntities(match[1] || ""));
  if (chunks.length > 0) {
    return chunks.join("");
  }

  // Fallback for malformed documents to avoid failing key detection entirely.
  return decodeXmlEntities(documentXml.replace(/<[^>]+>/g, " "));
}

export function parseDataSourceBuffer(buffer: Buffer, sourceType: CorrespondenceSourceType): MergeRow[] {
  if (sourceType === "csv") {
    const records = parseCsv(buffer.toString("utf8"), {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true
    }) as Array<Record<string, unknown>>;
    return records.map((row) => normalizeRow(row));
  }

  if (sourceType === "xlsx") {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new ApiError(400, "XLSX data source has no sheets.");
    }
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null });
    return rows.map((row) => normalizeRow(row));
  }

  try {
    const parsed = JSON.parse(buffer.toString("utf8"));
    if (!Array.isArray(parsed)) {
      throw new ApiError(400, "JSON data source must be an array of objects.");
    }
    return parsed.map((row) => normalizeRow(row as Record<string, unknown>));
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(400, "JSON data source is invalid.");
  }
}

function normalizeRow(row: Record<string, unknown>): MergeRow {
  const normalized: MergeRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (!key.trim()) continue;
    if (value === null || value === undefined) {
      normalized[key.trim()] = null;
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      normalized[key.trim()] = value;
      continue;
    }
    normalized[key.trim()] = JSON.stringify(value);
  }
  return normalized;
}

export function extractColumns(rows: MergeRow[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }
  return Array.from(columns).sort((left, right) => left.localeCompare(right));
}

function renderDocxFromTemplate(templateBuffer: Buffer, data: MergeRow, delimiter: CorrespondenceDelimiter): Buffer {
  try {
    const zip = new PizZip(templateBuffer);
    const pair = resolveDelimiterPair(delimiter);
    const doc = new Docxtemplater(zip, {
      delimiters: pair,
      paragraphLoop: true,
      linebreaks: true
    });
    doc.render(data);
    return doc.getZip().generate({ type: "nodebuffer" });
  } catch {
    throw new ApiError(400, "Failed to render DOCX with provided data.");
  }
}

function buildOutputDocPath(
  tenantId: string,
  jobId: string,
  jobName: string,
  index: number
): string {
  const segment = sanitizeFileSegment(jobName) || "correspondence";
  return `tenants/${tenantId}/correspondence/jobs/${jobId}/documents/${segment}-${String(index + 1).padStart(4, "0")}.docx`;
}

function buildResultZipPath(tenantId: string, jobId: string): string {
  return `tenants/${tenantId}/correspondence/jobs/${jobId}/result.zip`;
}

export async function runCorrespondenceDocxJob(input: {
  tenantId: string;
  jobId: string;
  jobName: string;
  template: CorrespondenceTemplate;
  dataSource: CorrespondenceDataSource;
  outputFormats: CorrespondenceOutputFormat[];
  maxRows: number;
}): Promise<{
  processedRows: number;
  failedRows: number;
  resultZipPath: string;
  rowsCount: number;
  columns: string[];
}> {
  if (!input.outputFormats.includes("docx")) {
    throw new ApiError(400, "DOCX output is required.");
  }

  if (input.outputFormats.some((format) => format !== "docx")) {
    throw new ApiError(400, "Only DOCX output is supported in v1.");
  }

  if (!input.dataSource.filePath) {
    throw new ApiError(400, "Data source file is missing.");
  }

  const templateBuffer = await downloadStorageFile(input.template.filePath);
  const sourceBuffer = await downloadStorageFile(input.dataSource.filePath);
  const rows = parseDataSourceBuffer(sourceBuffer, input.dataSource.sourceType);
  if (!rows.length) {
    throw new ApiError(400, "Data source has no rows.");
  }

  if (rows.length > input.maxRows) {
    throw new ApiError(400, `Row limit exceeded. Maximum supported rows: ${input.maxRows}.`);
  }

  const zip = new JSZip();
  let processedRows = 0;
  let failedRows = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    try {
      const rendered = renderDocxFromTemplate(templateBuffer, row, input.template.delimiter);
      const outputPath = buildOutputDocPath(input.tenantId, input.jobId, input.jobName, index);
      await uploadStorageFile(
        outputPath,
        rendered,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      zip.file(outputPath.split("/").slice(-1)[0], rendered);
      processedRows += 1;
    } catch {
      failedRows += 1;
    }
  }

  if (!processedRows) {
    throw new ApiError(400, "No documents could be generated from the data source.");
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const resultZipPath = buildResultZipPath(input.tenantId, input.jobId);
  await uploadStorageFile(resultZipPath, zipBuffer, "application/zip");

  return {
    processedRows,
    failedRows,
    resultZipPath,
    rowsCount: rows.length,
    columns: extractColumns(rows)
  };
}


