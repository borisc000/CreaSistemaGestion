import { describe, expect, it } from "vitest";
import { buildImportPreview } from "../../src/server/domain/integration-import";

describe("integration import preview", () => {
  it("maps people csv rows into canonical rows", () => {
    const content = [
      "idNumber;fullName;position;contractId;hireDate;employmentStatus;sourceCandidateId",
      "12.345.678-5;Ana Perez;Analista;contract-1;2026-03-01;active;",
      "bad-rut;Persona Dos;Coordinador;;2026-03-01;invalid-status;"
    ].join("\n");

    const preview = buildImportPreview("people", content, ";");
    expect(preview.totalRows).toBe(2);
    expect(preview.validRows).toHaveLength(1);
    expect(preview.errors).toHaveLength(1);
    expect(preview.errors[0].row).toBe(3);
  });

  it("maps payroll csv rows and parses json line items", () => {
    const content = [
      "personRef,period,grossIncome,netIncome,currency,itemsJson",
      'person-1,2026-02,1200000,980000,CLP,"[{""code"":""BON"",""label"":""Bono"",""amount"":120000}]"'
    ].join("\n");

    const preview = buildImportPreview("payroll", content, ",");
    expect(preview.totalRows).toBe(1);
    expect(preview.errors).toHaveLength(0);
    expect(preview.validRows).toHaveLength(1);
    const row = preview.validRows[0] as { items: Array<{ code: string; amount: number }> };
    expect(row.items[0].code).toBe("BON");
    expect(row.items[0].amount).toBe(120000);
  });
});
