"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  EmptyState,
  FormDrawer,
  InlineError,
  KpiGrid,
  ModuleActionBar,
  ModulePage,
  Panel,
  StatusBadge,
  Toast
} from "@/features/modules/module-ui";
import { HrAccreditationPanel } from "@/features/modules/hr-accreditation-panel";
import { useCrudModule } from "@/features/modules/use-crud-module";
import { useApiClient } from "@/lib/api/use-api-client";
import { REQUIRED_PERSON_DOCUMENT_TYPES } from "@/types/catalogs";
import { formatDate } from "@/lib/format";
import { firebaseStorage } from "@/lib/firebase/client";
import type {
  Contract,
  EmploymentStatus,
  PersonContractAssignment,
  PersonDocument,
  PersonDocumentStatus,
  PersonRecord
} from "@/types/domain";

const EMPLOYMENT_STATUSES: EmploymentStatus[] = ["active", "on_leave", "inactive"];
type HrPeopleTab = "people" | "documents" | "accreditation";

type UploadIntentResponse = {
  data: {
    uploadIntentId: string;
    uploadPath: string;
    expiresAt: string;
  };
};

function toneFromDocumentStatus(status: PersonDocumentStatus): "good" | "warn" | "risk" {
  if (status === "expired") return "risk";
  if (status === "expiring" || status === "pending") return "warn";
  return "good";
}

function isDateRangeActive(startDate: string, endDate: string | null): boolean {
  const now = new Date();
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return false;
  if (start.getTime() > now.getTime()) return false;
  if (!endDate) return true;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return true;
  return end.getTime() >= now.getTime();
}

export function HrPeoplePage() {
  const api = useApiClient();
  const peopleApi = useCrudModule<PersonRecord>("/api/hr/people");
  const documentsApi = useCrudModule<PersonDocument>("/api/hr/documents");
  const contractsApi = useCrudModule<Contract>("/api/contracts");
  const assignmentsApi = useCrudModule<PersonContractAssignment>("/api/hr/accreditation/assignments?status=active");

  const [form, setForm] = useState({
    fullName: "",
    idNumber: "",
    position: "",
    contractId: "",
    hireDate: "",
    employmentStatus: "active" as EmploymentStatus,
    email: "",
    phone: "",
    jobFunction: "",
    employmentType: ""
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
  const [activeTab, setActiveTab] = useState<HrPeopleTab>("people");
  const [isPersonDrawerOpen, setPersonDrawerOpen] = useState(false);
  const [isDocumentDrawerOpen, setDocumentDrawerOpen] = useState(false);
  const [documentActionPendingId, setDocumentActionPendingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "success" | "error" } | null>(null);

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

  const activeAssignmentsByPerson = useMemo(() => {
    const map = new Map<string, number>();
    for (const assignment of assignmentsApi.items) {
      if (assignment.status !== "active" || !isDateRangeActive(assignment.startDate, assignment.endDate)) {
        continue;
      }
      map.set(assignment.personId, (map.get(assignment.personId) || 0) + 1);
    }
    return map;
  }, [assignmentsApi.items]);

  async function handleDocumentUpload(): Promise<boolean> {
    if (!documentForm.personId || !file) return false;

    setUploading(true);
    setUploadError(null);
    try {
      if (!firebaseStorage) {
        throw new Error("Firebase Storage is not configured. Check NEXT_PUBLIC_FIREBASE_* env vars.");
      }

      const fileName = file.name;
      const uploadIntent = await api.post<UploadIntentResponse>("/api/hr/documents/upload-intent", {
        personId: documentForm.personId,
        fileName,
        mimeType: file.type,
        sizeBytes: file.size
      });

      const storageRef = ref(firebaseStorage, uploadIntent.data.uploadPath);
      await uploadBytes(storageRef, file);

      await documentsApi.create({
        personId: documentForm.personId,
        docType: documentForm.docType,
        fileName,
        uploadIntentId: uploadIntent.data.uploadIntentId,
        expiryDate: documentForm.expiryDate || null
      });

      setDocumentForm({ personId: "", docType: REQUIRED_PERSON_DOCUMENT_TYPES[0], expiryDate: "" });
      setFile(null);
      setToast({ message: "Documento subido y registrado.", tone: "success" });
      return true;
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "No se pudo subir documento.");
      setToast({ message: "No se pudo subir documento.", tone: "error" });
      return false;
    } finally {
      setUploading(false);
    }
  }

  async function handleDocumentAccess(document: PersonDocument, mode: "view" | "download") {
    if (!document.filePath) {
      setToast({ message: "El documento no tiene ruta de archivo registrada.", tone: "error" });
      return;
    }

    if (!firebaseStorage) {
      setToast({ message: "Firebase Storage no esta configurado.", tone: "error" });
      return;
    }

    setDocumentActionPendingId(document.id);
    const previewWindow = mode === "view" ? window.open("", "_blank", "noopener,noreferrer") : null;
    try {
      const url = await getDownloadURL(ref(firebaseStorage, document.filePath));
      if (mode === "view") {
        if (previewWindow) {
          previewWindow.location.href = url;
        } else {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      } else {
        const anchor = window.document.createElement("a");
        anchor.href = url;
        anchor.download = document.fileName || "documento";
        window.document.body.appendChild(anchor);
        anchor.click();
        window.document.body.removeChild(anchor);
      }
    } catch (err) {
      if (previewWindow) {
        previewWindow.close();
      }
      setToast({
        message: err instanceof Error ? err.message : "No se pudo abrir el documento.",
        tone: "error"
      });
    } finally {
      setDocumentActionPendingId(null);
    }
  }

  return (
    <ModulePage
      title="RRHH - Gestion de personas"
      description="Gestion de colaboradores con contrato principal de ficha, asignaciones multi-contrato y control documental."
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
      <div className="module-tabs" role="tablist" aria-label="RRHH Personas tabs">
        <button
          className={`tab-btn ${activeTab === "people" ? "is-active" : ""}`}
          type="button"
          onClick={() => setActiveTab("people")}
        >
          Personas
        </button>
        <button
          className={`tab-btn ${activeTab === "documents" ? "is-active" : ""}`}
          type="button"
          onClick={() => setActiveTab("documents")}
        >
          Documentos
        </button>
        <button
          className={`tab-btn ${activeTab === "accreditation" ? "is-active" : ""}`}
          type="button"
          onClick={() => setActiveTab("accreditation")}
        >
          Acreditacion
        </button>
      </div>
      <InlineError message={uploadError || peopleApi.error || documentsApi.error || contractsApi.error || assignmentsApi.error} />

      {activeTab === "people" ? (
      <ModuleActionBar>
        <button className="btn-primary" type="button" onClick={() => setPersonDrawerOpen(true)}>
          Agregar persona
        </button>
      </ModuleActionBar>
      ) : null}

      <FormDrawer
        isOpen={isPersonDrawerOpen}
        title="Agregar persona"
        description="Crea una nueva ficha de persona."
        onClose={() => setPersonDrawerOpen(false)}
      >
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void peopleApi.create({
              ...form,
              contractId: form.contractId || null,
              email: form.email || null,
              phone: form.phone || null,
              jobFunction: form.jobFunction || null,
              employmentType: form.employmentType || null
            }).then((ok) => {
              if (!ok) {
                setToast({ message: "No se pudo crear persona.", tone: "error" });
                return;
              }
              setToast({ message: "Persona creada.", tone: "success" });
              setPersonDrawerOpen(false);
              setForm({
                fullName: "",
                idNumber: "",
                position: "",
                contractId: "",
                hireDate: "",
                employmentStatus: "active",
                email: "",
                phone: "",
                jobFunction: "",
                employmentType: ""
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
            Contrato principal (ficha)
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
            <small>
              Referencia inicial. Las asignaciones operativas adicionales se gestionan en la pestaña Acreditacion.
            </small>
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
          <label>
            Correo
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </label>
          <label>
            Telefono
            <input
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </label>
          <label>
            Funcion
            <input
              value={form.jobFunction}
              onChange={(event) => setForm((prev) => ({ ...prev, jobFunction: event.target.value }))}
            />
          </label>
          <label>
            Tipo contrato
            <input
              value={form.employmentType}
              onChange={(event) => setForm((prev) => ({ ...prev, employmentType: event.target.value }))}
            />
          </label>
          <button className="btn-primary" type="submit" disabled={peopleApi.pending === "saving"}>
            Guardar persona
          </button>
          <button className="btn-secondary" type="button" onClick={() => setPersonDrawerOpen(false)}>
            Cancelar
          </button>
        </form>
      </FormDrawer>

      {activeTab === "documents" ? (
      <ModuleActionBar>
        <button className="btn-primary" type="button" onClick={() => setDocumentDrawerOpen(true)}>
          Cargar documento
        </button>
      </ModuleActionBar>
      ) : null}

      <FormDrawer
        isOpen={isDocumentDrawerOpen}
        title="Cargar documento"
        description="Sube el archivo y registra su metadato documental."
        onClose={() => setDocumentDrawerOpen(false)}
      >
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void handleDocumentUpload().then((ok) => {
              if (ok) {
                setDocumentDrawerOpen(false);
              }
            });
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
          <button className="btn-secondary" type="button" onClick={() => setDocumentDrawerOpen(false)}>
            Cancelar
          </button>
        </form>
      </FormDrawer>

      {activeTab === "people" ? (
      <Panel title="Personas y cumplimiento documental">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Persona</th>
                <th>RUT / ID</th>
                <th>Cargo</th>
                <th>Correo</th>
                <th>Funcion</th>
                <th>Contrato principal</th>
                <th>Asignaciones activas</th>
                <th>Ingreso</th>
                <th>Estado</th>
                <th>Cumplimiento</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {peopleApi.items.length === 0 ? (
                <tr className="table-empty-row">
                  <td colSpan={11}>
                    <EmptyState message="Aun no hay personas cargadas en RRHH." />
                  </td>
                </tr>
              ) : null}
              {peopleApi.items.map((person) => {
                const contract = contractsApi.items.find((item) => item.id === person.contractId);
                const activeAssignments = activeAssignmentsByPerson.get(person.id) || 0;
                const docs = documentsApi.items.filter((item) => item.personId === person.id);
                const completed = REQUIRED_PERSON_DOCUMENT_TYPES.filter((type) =>
                  docs.some((item) => item.docType === type && item.status !== "expired")
                ).length;

                return (
                  <tr key={person.id}>
                    <td>{person.fullName}</td>
                    <td>{person.idNumber}</td>
                    <td>{person.position}</td>
                    <td>{person.email || "-"}</td>
                    <td>{person.jobFunction || "-"}</td>
                    <td>{contract?.name || "Sin contrato"}</td>
                    <td>{activeAssignments}</td>
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
      ) : null}

      {activeTab === "documents" ? (
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
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {documentsApi.items.length === 0 ? (
                <tr className="table-empty-row">
                  <td colSpan={6}>
                    <EmptyState message="No hay documentos registrados todavia." />
                  </td>
                </tr>
              ) : null}
              {documentsApi.items.map((document) => {
                const person = peopleApi.items.find((item) => item.id === document.personId);
                const busy = documentActionPendingId === document.id;
                return (
                  <tr key={document.id}>
                    <td>{person?.fullName || "Persona no encontrada"}</td>
                    <td>{document.docType}</td>
                    <td>{document.fileName}</td>
                    <td>{formatDate(document.expiryDate)}</td>
                    <td>
                      <StatusBadge tone={toneFromDocumentStatus(document.status)}>{document.status}</StatusBadge>
                    </td>
                    <td>
                      <div className="toolbar">
                        <button
                          className="btn-secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDocumentAccess(document, "view")}
                        >
                          Ver
                        </button>
                        <button
                          className="btn-secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDocumentAccess(document, "download")}
                        >
                          Descargar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      ) : null}

      {activeTab === "accreditation" ? <HrAccreditationPanel /> : null}
    </ModulePage>
  );
}
