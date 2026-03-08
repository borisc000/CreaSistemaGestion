import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { ApiError } from "@/server/api/response";
import { detectTemplateKeysFromDocx, extractColumns, parseDataSourceBuffer } from "@/server/domain/correspondence";

function buildDocxWithDocumentXml(documentXml: string): Buffer {
  const zip = new PizZip();
  zip.file("word/document.xml", documentXml);
  return zip.generate({ type: "nodebuffer" });
}

describe("correspondence domain", () => {
  it("detects keys using angle delimiter", () => {
    const template = buildDocxWithDocumentXml(
      "<w:document><w:body><w:p>Hola \u00abnombre\u00bb y \u00abcargo\u00bb.</w:p></w:body></w:document>"
    );
    const keys = detectTemplateKeysFromDocx(template, "angle");
    expect(keys).toEqual(["cargo", "nombre"]);
  });

  it("detects split keys when placeholder is divided across runs", () => {
    const template = buildDocxWithDocumentXml(
      "<w:document><w:body><w:p><w:r><w:t>\u00abno</w:t></w:r><w:r><w:t>mbre\u00bb</w:t></w:r></w:p></w:body></w:document>"
    );
    const keys = detectTemplateKeysFromDocx(template, "angle");
    expect(keys).toEqual(["nombre"]);
  });

  it("detects keys using question delimiter", () => {
    const template = buildDocxWithDocumentXml(
      "<w:document><w:body><w:p>Hola ?nombre? desde ?empresa?.</w:p></w:body></w:document>"
    );
    const keys = detectTemplateKeysFromDocx(template, "question");
    expect(keys).toEqual(["empresa", "nombre"]);
  });

  it("parses csv data source with headers", () => {
    const rows = parseDataSourceBuffer(Buffer.from("nombre,cargo\nAna,PM\nLuis,QA\n", "utf8"), "csv");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ nombre: "Ana", cargo: "PM" });
  });

  it("parses json data source as array of objects", () => {
    const rows = parseDataSourceBuffer(Buffer.from('[{"nombre":"Ana"},{"nombre":"Luis"}]', "utf8"), "json");
    expect(rows).toHaveLength(2);
    expect(extractColumns(rows)).toEqual(["nombre"]);
  });

  it("rejects invalid json source shape", () => {
    expect(() => parseDataSourceBuffer(Buffer.from('{"nombre":"Ana"}', "utf8"), "json")).toThrowError(ApiError);
  });
});
