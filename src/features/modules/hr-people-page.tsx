"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ref, uploadBytes } from "firebase/storage";
import { EmptyState, InlineError, KpiGrid, ModulePage, Panel, StatusBadge, Toast } from "@/features/modules/module-ui";
import { useCrudModule } from "@/features/modules/use-crud-module";
import { REQUIRED_PERSON_DOCUMENT_TYPES } from "@/types/catalogs";
import { formatDate } from "@/lib/format";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { firebaseStorage } from "@/lib/firebase/client";
import { useApiClient } from "@/lib/api/use-api-client";
import type {
  Contract,
  EmploymentStatus,
  IntegrationDataset,
  PersonDocument,
  PersonDocumentStatus,
  PersonRecord
} from "@/types/domain";

const EMPLOYMENT_STATUSES: EmploymentStatus[] = ["active", "on_leave", "inactive"];

function toneFromDocumentStatus(status: PersonDocumentStatus): "good" | "warn" | "risk" {
  if (status === "expired") return "risk";
  if (status === "expiring" || status === "pending") return "warn";
  return "good";
}

function normalizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

type ImportApiResponse = {
  data: {
    runId?: string;
    status?: string;
    preview?: unknown[];
    summary: {
      received: number;
      valid: number;
      committed?: number;
      created?: number;
      updated?: number;
      errors: number;
    };
    errors: Array<{ row: number; code: string; message: string }>;
  };
};

export function HrPeoplePage() {
  const api = useApiClient();
  const peopleApi = useCrudModule<PersonRecord>("/api/hr/people");
  const documentsApi = useCrudModule<PersonDocument>("/api/hr/documents");
  const contractsApi = useCrudModule<Contract>("/api/contracts");

  const [form, setForm] = useState({
    fullName: "",
    idNumber: "",
    position: "",
    contractId: "",
    hireDate: "",
    employmentStatus: "active" as EmploymentStatus
  });

  const [documentForm, setDocumentForm] = useState<{
    personId: string;
    docType: string;
    expiryDate: string;
  }>({
    personId: "",
    docType: REQUIRED_PERSON_DOCUMENT_TYPES[0],
    expiryDate: ""
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "success" | "error" } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importForm, setImportForm] = useState<{
    dataset: IntegrationDataset;
    source: string;
    delimiter: "," | ";";
    content: string;
  }>({
    dataset: "people",
    source: "csv-manual",
    delimiter: ";",
    content: ""
  });
  const [importResult, setImportResult] = useState<ImportApiResponse["data"] | null>(null);

  const documentStats = useMemo(() => {
    const expired = documentsApi.items.filter((item) => item.status === "expired").length;
    const expiring = documentsApi.items.filter((item) => item.status === "expiring").length;

    return {
      expired,
      expiring,
      compliantPeople: peopleApi.items.filter((person) => {
        const docs = documentsApi.items.filter((doc) => doc.personId === person.id);
        return REQUIRED_PERSON_DOCUMENT_TYPES.every((type) =>
          docs.some((doc) => doc.docType === type && doc.status !== "expired")
        );
      }).length
    };
  }, [documentsApi.items, peopleApi.items]);

  async function handleDocumentUpload() {
    if (!documentForm.personId || !file) return;

    setUploading(true);
    setUploadError(null);
    try {
      if (!firebaseStorage) {
        throw new Error("Firebase Storage is not configured. Check NEXT_PUBLIC_FIREBASE_* env vars.");
      }

      const fileName = file.name;
      const filePath = `tenants/${DEFAULT_TENANT_ID}/people/${documentForm.personId}/documents/${Date.now()}-${normalizeFileName(fileName)}`;
      const storageRef = ref(firebaseStorage, filePath);
      await uploadBytes(storageRef, file);

      await documentsApi.create({
        personId: documentForm.personId,
        docType: documentForm.docType,
        fileName,
        filePath,
        expiryDate: documentForm.expiryDate || null
      });

      setDocumentForm({ personId: "", docType: REQUIRED_PERSON_DOCUMENT_TYPES[0], expiryDate: "" });
      setFile(null);
      setToast({ message: "Documento subido y registrado.", tone: "success" });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "No se pudo subir documento.");
      setToast({ message: "No se pudo subir documento.", tone: "error" });
    } finally {
      setUploading(false);
    }
  }

  async function handleImport(mode: "preview" | "commit") {
    if (!importForm.content.trim()) {
      setToast({ message: "Pega contenido CSV para importar.", tone: "error" });
      return;
    }

    setImporting(true);
    try {
      const response = await api.post<ImportApiResponse>("/api/hr/imports", {
        mode,
        source: importForm.source,
        dataset: importForm.dataset,
        delimiter: importForm.delimiter,
        content: importForm.content
      });
      setImportResult(response.data);

      if (mode === "preview") {
        setToast({ message: "Preview generado.", tone: "info" });
      } else {
        setToast({
          message:
            response.data.status === "ok"
              ? "Importacion aplicada."
              : "Importacion aplicada con observaciones.",
          tone: response.data.status === "ok" ? "success" : "error"
        });
        await peopleApi.reload();
      }
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "No se pudo ejecutar importacion.",
        tone: "error"
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <ModulePage
      title="RRHH - Gestion de personas"
      description="Ficha de colaboradores por contrato y control documental con Storage + metadata Firestore."
    >
      <Toast message={toast?.message || null} tone={toast?.tone || "info"} />
      <KpiGrid
        items={[
          { label: "Personas", value: peopleApi.items.length },
          { label: "Con dotacion activa", value: peopleApi.items.filter((item) => item.employmentStatus === "active").length },
          { label: "Documentos por vencer", value: documentStats.expiring },
          { label: "Documentos vencidos", value: documentStats.expired }
        ]}
      />

      <Panel title="Nueva persona">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void peopleApi.create({
              ...form,
              contractId: form.contractId || null
            }).then((ok) => {
              if (!ok) {
                setToast({ message: "No se pudo crear persona.", tone: "error" });
                return;
              }
              setToast({ message: "Persona creada.", tone: "success" });
              setForm({
                fullName: "",
                idNumber: "",
                position: "",
                contractId: "",
                hireDate: "",
                employmentStatus: "active"
              });
            });
          }}
        >
          <label>
            Nombre completo
            <input
              value={form.fullName}
              onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
              required
            />
          </label>
          <label>
            ID / RUT
            <input
              value={form.idNumber}
              onChange={(event) => setForm((prev) => ({ ...prev, idNumber: event.target.value }))}
              required
            />
          </label>
          <label>
            Cargo
            <input
              value={form.position}
              onChange={(event) => setForm((prev) => ({ ...prev, position: event.target.value }))}
              required
            />
          </label>
          <label>
            Contrato
            <select
              value={form.contractId}
              onChange={(event) => setForm((prev) => ({ ...prev, contractId: event.target.value }))}
            >
              <option value="">Sin contrato</option>
              {contractsApi.items.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha ingreso
            <input
              type="date"
              value={form.hireDate}
              onChange={(event) => setForm((prev) => ({ ...prev, hireDate: event.target.value }))}
              required
            />
          </label>
          <label>
            Estado laboral
            <select
              value={form.employmentStatus}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, employmentStatus: event.target.value as EmploymentStatus }))
              }
            >
              {EMPLOYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" type="submit" disabled={peopleApi.pending === "saving"}>
            Guardar persona
          </button>
        </form>
      </Panel>

      <Panel title="Subir documento">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void handleDocumentUpload();
          }}
        >
          <label>
            Persona
            <select
              value={documentForm.personId}
              onChange={(event) => setDocumentForm((prev) => ({ ...prev, personId: event.target.value }))}
              required
            >
              <option value="">Selecciona</option>
              {peopleApi.items.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo documento
            <select
              value={documentForm.docType}
              onChange={(event) => setDocumentForm((prev) => ({ ...prev, docType: event.target.value }))}
            >
              {REQUIRED_PERSON_DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha vencimiento
            <input
              type="date"
              value={documentForm.expiryDate}
              onChange={(event) => setDocumentForm((prev) => ({ ...prev, expiryDate: event.target.value }))}
            />
          </label>
          <label>
            Archivo
            <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} required />
          </label>
          <button
            className="btn-primary"
            type="submit"
            disabled={!file || uploading || documentsApi.pending === "saving"}
          >
            {uploading ? "Subiendo..." : "Guardar documento"}
          </button>
        </form>
      </Panel>

      <Panel title="Importacion estandar (CSV)">
        <p>Base integration-ready para alta/actualizacion de personas y nomina resumen.</p>
        <div className="form-grid">
          <label>
            Dataset
            <select
              value={importForm.dataset}
              onChange={(event) =>
                setImportForm((prev) => ({ ...prev, dataset: event.target.value as IntegrationDataset }))
              }
            >
              <option value="people">people</option>
              <option value="payroll">payroll</option>
            </select>
          </label>
          <label>
            Origen
            <input
              value={importForm.source}
              onChange={(event) => setImportForm((prev) => ({ ...prev, source: event.target.value }))}
            />
          </label>
          <label>
            Delimitador
            <select
              value={importForm.delimiter}
              onChange={(event) =>
                setImportForm((prev) => ({ ...prev, delimiter: event.target.value as "," | ";" }))
              }
            >
              <option value=";">;</option>
              <option value=",">,</option>
            </select>
          </label>
        </div>
        <label className="import-area">
          CSV
          <textarea
            value={importForm.content}
            onChange={(event) => setImportForm((prev) => ({ ...prev, content: event.target.value }))}
            placeholder="idNumber;fullName;position;contractId;hireDate;employmentStatus;sourceCandidateId"
          />
        </label>
        <div className="toolbar">
          <button className="btn-secondary" type="button" disabled={importing} onClick={() => void handleImport("preview")}>
            {importing ? "Procesando..." : "Preview"}
          </button>
          <button className="btn-primary" type="button" disabled={importing} onClick={() => void handleImport("commit")}>
            {importing ? "Procesando..." : "Commit"}
          </button>
        </div>

        {importResult ? (
          <div className="diff-box">
            <p>
              Filas recibidas: <strong>{importResult.summary.received}</strong> | validas:{" "}
              <strong>{importResult.summary.valid}</strong> | errores: <strong>{importResult.summary.errors}</strong>
            </p>
            {typeof importResult.summary.committed === "number" ? (
              <p>
                Committed: <strong>{importResult.summary.committed}</strong> | creadas:{" "}
                <strong>{importResult.summary.created || 0}</strong> | actualizadas:{" "}
                <strong>{importResult.summary.updated || 0}</strong>
              </p>
            ) : null}
            {importResult.errors.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Codigo</th>
                      <th>Mensaje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.errors.slice(0, 20).map((item) => (
                      <tr key={`${item.row}-${item.code}-${item.message}`}>
                        <td>{item.row}</td>
                        <td>{item.code}</td>
                        <td>{item.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="Sin errores en la importacion." />
            )}
          </div>
        ) : null}
      </Panel>

      <Panel title="Personas y cumplimiento documental">
        <InlineError message={uploadError || peopleApi.error || documentsApi.error || contractsApi.error} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Persona</th>
                <th>RUT / ID</th>
                <th>Cargo</th>
                <th>Contrato</th>
                <th>Ingreso</th>
                <th>Estado</th>
                <th>Cumplimiento</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {peopleApi.items.length === 0 ? (
                <tr className="table-empty-row">
                  <td colSpan={8}>
                    <EmptyState message="Aun no hay personas cargadas en RRHH." />
                  </td>
                </tr>
              ) : null}
              {peopleApi.items.map((person) => {
                const contract = contractsApi.items.find((item) => item.id === person.contractId);
                const docs = documentsApi.items.filter((item) => item.personId === person.id);
                const completed = REQUIRED_PERSON_DOCUMENT_TYPES.filter((type) =>
                  docs.some((item) => item.docType === type && item.status !== "expired")
                ).length;

                return (
                  <tr key={person.id}>
                    <td>{person.fullName}</td>
                    <td>{person.idNumber}</td>
                    <td>{person.position}</td>
                    <td>{contract?.name || "Sin contrato"}</td>
                    <td>{formatDate(person.hireDate)}</td>
                    <td>{person.employmentStatus}</td>
                    <td>{completed}/{REQUIRED_PERSON_DOCUMENT_TYPES.length}</td>
                    <td>
                      <Link className="btn-secondary" href={`/rrhh/personas/${person.id}`}>
                        Ver ficha
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Documentos registrados">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Persona</th>
                <th>Documento</th>
                <th>Archivo</th>
                <th>Vence</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {documentsApi.items.length === 0 ? (
                <tr className="table-empty-row">
                  <td colSpan={5}>
                    <EmptyState message="No hay documentos registrados todavia." />
                  </td>
                </tr>
              ) : null}
              {documentsApi.items.map((document) => {
                const person = peopleApi.items.find((item) => item.id === document.personId);
                return (
                  <tr key={document.id}>
                    <td>{person?.fullName || "Persona no encontrada"}</td>
                    <td>{document.docType}</td>
                    <td>{document.fileName}</td>
                    <td>{formatDate(document.expiryDate)}</td>
                    <td>
                      <StatusBadge tone={toneFromDocumentStatus(document.status)}>{document.status}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </ModulePage>
  );
}
