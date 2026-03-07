"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { EmptyState, InlineError, KpiGrid, ModulePage, Panel, SkeletonRows, Toast } from "@/features/modules/module-ui";
import { HrAccreditationPanel } from "@/features/modules/hr-accreditation-panel";
import { useCrudModule } from "@/features/modules/use-crud-module";
import { formatCurrency, formatDate } from "@/lib/format";
import { useApiClient } from "@/lib/api/use-api-client";
import { firebaseStorage } from "@/lib/firebase/client";
import { EMPLOYMENT_STATUSES } from "@/types/catalogs";
import type {
  AuditLogEntry,
  Candidate,
  Contract,
  EmploymentStatus,
  PersonContractAssignment,
  PersonDocument,
  PersonPayrollRecord,
  PersonRecord,
  Vacancy
} from "@/types/domain";

type PersonDetailResponse = {
  data: {
    person: PersonRecord;
    contract: Contract | null;
    sourceCandidate: Candidate | null;
    sourceVacancy: Vacancy | null;
    documents: PersonDocument[];
    payroll: {
      records: PersonPayrollRecord[];
      summary: {
        periods: number;
        grossTotal: number;
        netTotal: number;
      };
      placeholders: string[];
    };
    accreditation: {
      activeAssignments: PersonContractAssignment[];
      indicators: Array<{
        contractId: string;
        contractName: string;
        summary: {
          total: number;
          pending: number;
          expired: number;
          compliant: number;
          reused: number;
        };
      }>;
    };
    timeline: AuditLogEntry[];
  };
};

type EditablePersonForm = {
  fullName: string;
  idNumber: string;
  position: string;
  contractId: string;
  hireDate: string;
  employmentStatus: EmploymentStatus;
  email: string;
  phone: string;
  birthDate: string;
  nationality: string;
  maritalStatus: string;
  addressLine: string;
  district: string;
  city: string;
  country: string;
  jobFunction: string;
  employmentType: string;
  contractEndDate: string;
  workSchedule: string;
  workHours: string;
  externalCode: string;
  purchaseOrder: string;
  healthProvider: string;
  pensionFund: string;
  baseSalary: string;
  mealAllowance: string;
  transportAllowance: string;
  otherBonuses: string;
};

type PersonDetailTab = "summary" | "documents" | "accreditation" | "payroll" | "audit";

function eventPillClass(eventType: AuditLogEntry["eventType"]) {
  if (eventType === "created") return "pill pill-created";
  if (eventType === "deleted") return "pill pill-deleted";
  return "pill pill-updated";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseOptionalAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function amountToInput(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  return String(value);
}

function buildEditablePersonForm(person: PersonRecord): EditablePersonForm {
  return {
    fullName: person.fullName,
    idNumber: person.idNumber,
    position: person.position,
    contractId: person.contractId || "",
    hireDate: person.hireDate,
    employmentStatus: person.employmentStatus,
    email: person.email || "",
    phone: person.phone || "",
    birthDate: person.birthDate || "",
    nationality: person.nationality || "",
    maritalStatus: person.maritalStatus || "",
    addressLine: person.addressLine || "",
    district: person.district || "",
    city: person.city || "",
    country: person.country || "",
    jobFunction: person.jobFunction || "",
    employmentType: person.employmentType || "",
    contractEndDate: person.contractEndDate || "",
    workSchedule: person.workSchedule || "",
    workHours: person.workHours || "",
    externalCode: person.externalCode || "",
    purchaseOrder: person.purchaseOrder || "",
    healthProvider: person.healthProvider || "",
    pensionFund: person.pensionFund || "",
    baseSalary: amountToInput(person.baseSalary),
    mealAllowance: amountToInput(person.mealAllowance),
    transportAllowance: amountToInput(person.transportAllowance),
    otherBonuses: amountToInput(person.otherBonuses)
  };
}

type EditablePersonPatchValues = {
  fullName: string;
  idNumber: string;
  position: string;
  contractId: string | null;
  hireDate: string;
  employmentStatus: EmploymentStatus;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  nationality: string | null;
  maritalStatus: string | null;
  addressLine: string | null;
  district: string | null;
  city: string | null;
  country: string | null;
  jobFunction: string | null;
  employmentType: string | null;
  contractEndDate: string | null;
  workSchedule: string | null;
  workHours: string | null;
  externalCode: string | null;
  purchaseOrder: string | null;
  healthProvider: string | null;
  pensionFund: string | null;
  baseSalary: number | null;
  mealAllowance: number | null;
  transportAllowance: number | null;
  otherBonuses: number | null;
};

function buildEditablePersonPatchValues(form: EditablePersonForm): EditablePersonPatchValues {
  return {
    fullName: form.fullName.trim(),
    idNumber: form.idNumber.trim(),
    position: form.position.trim(),
    contractId: form.contractId || null,
    hireDate: form.hireDate,
    employmentStatus: form.employmentStatus,
    email: normalizeOptionalText(form.email),
    phone: normalizeOptionalText(form.phone),
    birthDate: normalizeOptionalText(form.birthDate),
    nationality: normalizeOptionalText(form.nationality),
    maritalStatus: normalizeOptionalText(form.maritalStatus),
    addressLine: normalizeOptionalText(form.addressLine),
    district: normalizeOptionalText(form.district),
    city: normalizeOptionalText(form.city),
    country: normalizeOptionalText(form.country),
    jobFunction: normalizeOptionalText(form.jobFunction),
    employmentType: normalizeOptionalText(form.employmentType),
    contractEndDate: normalizeOptionalText(form.contractEndDate),
    workSchedule: normalizeOptionalText(form.workSchedule),
    workHours: normalizeOptionalText(form.workHours),
    externalCode: normalizeOptionalText(form.externalCode),
    purchaseOrder: normalizeOptionalText(form.purchaseOrder),
    healthProvider: normalizeOptionalText(form.healthProvider),
    pensionFund: normalizeOptionalText(form.pensionFund),
    baseSalary: parseOptionalAmount(form.baseSalary),
    mealAllowance: parseOptionalAmount(form.mealAllowance),
    transportAllowance: parseOptionalAmount(form.transportAllowance),
    otherBonuses: parseOptionalAmount(form.otherBonuses)
  };
}

function arePatchValuesEqual(left: EditablePersonPatchValues, right: EditablePersonPatchValues): boolean {
  const leftKeys = Object.keys(left) as Array<keyof EditablePersonPatchValues>;
  const rightKeys = Object.keys(right) as Array<keyof EditablePersonPatchValues>;
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

export function HrPersonDetailPage({ personId }: { personId: string }) {
  const api = useApiClient();
  const contractsApi = useCrudModule<Contract>("/api/contracts");
  const [data, setData] = useState<PersonDetailResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [documentActionPendingId, setDocumentActionPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "success" | "error" } | null>(null);
  const [form, setForm] = useState<EditablePersonForm | null>(null);
  const [activeTab, setActiveTab] = useState<PersonDetailTab>("summary");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<PersonDetailResponse>(`/api/hr/people/${personId}`);
      setData(response.data);
      setForm(buildEditablePersonForm(response.data.person));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la ficha de persona.");
    } finally {
      setLoading(false);
    }
  }, [api, personId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasChanges = useMemo(() => {
    if (!data || !form) return false;
    const current = buildEditablePersonPatchValues(form);
    const baseline = buildEditablePersonPatchValues(buildEditablePersonForm(data.person));
    return !arePatchValuesEqual(current, baseline);
  }, [data, form]);

  const saveChanges = useCallback(async () => {
    if (!data || !form || saving || !hasChanges) return;
    setSaving(true);
    setError(null);
    try {
      const patch = buildEditablePersonPatchValues(form);
      await api.patch("/api/hr/people", {
        id: data.person.id,
        ...patch
      });
      await load();
      setToast({ message: "Ficha actualizada.", tone: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar cambios.");
      setToast({ message: "No se pudo actualizar la ficha.", tone: "error" });
    } finally {
      setSaving(false);
    }
  }, [api, data, form, hasChanges, load, saving]);

  const handleDocumentAccess = useCallback(
    async (document: PersonDocument, mode: "view" | "download") => {
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
    },
    []
  );

  const compliantDocuments = useMemo(
    () =>
      data?.documents.filter((document) => document.status !== "expired").length || 0,
    [data?.documents]
  );

  const activeAssignmentContracts = useMemo(() => {
    if (!data) return [];
    const contractById = new Map(contractsApi.items.map((contract) => [contract.id, contract]));
    return data.accreditation.activeAssignments.map((assignment) => {
      const contract = contractById.get(assignment.contractId);
      return contract?.name || assignment.contractId;
    });
  }, [contractsApi.items, data]);

  return (
    <ModulePage
      title={data ? `Ficha 360 - ${data.person.fullName}` : "Ficha 360 de persona"}
      description="Vista integral de datos maestros, documentos, acreditacion, nomina resumen y trazabilidad."
    >
      <Toast message={toast?.message || null} tone={toast?.tone || "info"} />
      <Panel
        title="Acciones"
        right={
          <Link className="btn-secondary" href="/rrhh/personas">
            Volver a gestion de personas
          </Link>
        }
      >
        <p>Esta ficha consolida informacion transversal para gestion ERP de RRHH.</p>
      </Panel>

      <InlineError message={error || contractsApi.error} />

      {loading ? <SkeletonRows rows={8} /> : null}

      {!loading && !data ? <EmptyState message="No se encontro la persona solicitada." /> : null}

      {!loading && data ? (
        <>
          <KpiGrid
            items={[
              { label: "Estado laboral", value: data.person.employmentStatus },
              { label: "Documentos vigentes", value: compliantDocuments },
              { label: "Periodos nomina", value: data.payroll.summary.periods },
              { label: "Liquido acumulado", value: formatCurrency(data.payroll.summary.netTotal) }
            ]}
          />
          <div className="module-tabs" role="tablist" aria-label="Ficha persona tabs">
            <button
              className={`tab-btn ${activeTab === "summary" ? "is-active" : ""}`}
              type="button"
              onClick={() => setActiveTab("summary")}
            >
              Resumen
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
            <button
              className={`tab-btn ${activeTab === "payroll" ? "is-active" : ""}`}
              type="button"
              onClick={() => setActiveTab("payroll")}
            >
              Nomina
            </button>
            <button
              className={`tab-btn ${activeTab === "audit" ? "is-active" : ""}`}
              type="button"
              onClick={() => setActiveTab("audit")}
            >
              Auditoria
            </button>
          </div>

          {activeTab === "summary" ? (
          <Panel title="Datos maestros (editable)">
            {form ? (
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveChanges();
                }}
              >
                <label>
                  Nombre completo
                  <input
                    value={form.fullName}
                    onChange={(event) => setForm((current) => (current ? { ...current, fullName: event.target.value } : current))}
                    required
                  />
                </label>
                <label>
                  RUT / ID
                  <input
                    value={form.idNumber}
                    onChange={(event) => setForm((current) => (current ? { ...current, idNumber: event.target.value } : current))}
                    required
                  />
                </label>
                <label>
                  Cargo
                  <input
                    value={form.position}
                    onChange={(event) => setForm((current) => (current ? { ...current, position: event.target.value } : current))}
                    required
                  />
                </label>
                <label>
                  Contrato principal (ficha)
                  <select
                    value={form.contractId}
                    onChange={(event) => setForm((current) => (current ? { ...current, contractId: event.target.value } : current))}
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
                    onChange={(event) => setForm((current) => (current ? { ...current, hireDate: event.target.value } : current))}
                    required
                  />
                </label>
                <label>
                  Estado laboral
                  <select
                    value={form.employmentStatus}
                    onChange={(event) =>
                      setForm((current) =>
                        current ? { ...current, employmentStatus: event.target.value as EmploymentStatus } : current
                      )
                    }
                  >
                    {EMPLOYMENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <p style={{ gridColumn: "1 / -1", margin: "4px 0 0", fontWeight: 700, color: "var(--text-soft)" }}>
                  Contacto e identidad
                </p>
                <label>
                  Correo
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((current) => (current ? { ...current, email: event.target.value } : current))}
                  />
                </label>
                <label>
                  Telefono
                  <input
                    value={form.phone}
                    onChange={(event) => setForm((current) => (current ? { ...current, phone: event.target.value } : current))}
                  />
                </label>
                <label>
                  Fecha nacimiento
                  <input
                    type="date"
                    value={form.birthDate}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, birthDate: event.target.value } : current))
                    }
                  />
                </label>
                <label>
                  Nacionalidad
                  <input
                    value={form.nationality}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, nationality: event.target.value } : current))
                    }
                  />
                </label>
                <label>
                  Situacion civil
                  <input
                    value={form.maritalStatus}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, maritalStatus: event.target.value } : current))
                    }
                  />
                </label>
                <label>
                  Direccion
                  <input
                    value={form.addressLine}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, addressLine: event.target.value } : current))
                    }
                  />
                </label>
                <label>
                  Comuna
                  <input
                    value={form.district}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, district: event.target.value } : current))
                    }
                  />
                </label>
                <label>
                  Ciudad
                  <input
                    value={form.city}
                    onChange={(event) => setForm((current) => (current ? { ...current, city: event.target.value } : current))}
                  />
                </label>
                <label>
                  Pais
                  <input
                    value={form.country}
                    onChange={(event) => setForm((current) => (current ? { ...current, country: event.target.value } : current))}
                  />
                </label>
                <p style={{ gridColumn: "1 / -1", margin: "4px 0 0", fontWeight: 700, color: "var(--text-soft)" }}>
                  Laboral extendido
                </p>
                <label>
                  Funcion
                  <input
                    value={form.jobFunction}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, jobFunction: event.target.value } : current))
                    }
                  />
                </label>
                <label>
                  Tipo contrato
                  <input
                    value={form.employmentType}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, employmentType: event.target.value } : current))
                    }
                  />
                </label>
                <label>
                  Hasta
                  <input
                    type="date"
                    value={form.contractEndDate}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, contractEndDate: event.target.value } : current))
                    }
                  />
                </label>
                <label>
                  Horario
                  <input
                    value={form.workSchedule}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, workSchedule: event.target.value } : current))
                    }
                  />
                </label>
                <label>
                  Horas de trabajo
                  <input
                    value={form.workHours}
                    onChange={(event) => setForm((current) => (current ? { ...current, workHours: event.target.value } : current))}
                  />
                </label>
                <label>
                  Codigo
                  <input
                    value={form.externalCode}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, externalCode: event.target.value } : current))
                    }
                  />
                </label>
                <label>
                  OC
                  <input
                    value={form.purchaseOrder}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, purchaseOrder: event.target.value } : current))
                    }
                  />
                </label>
                <p style={{ gridColumn: "1 / -1", margin: "4px 0 0", fontWeight: 700, color: "var(--text-soft)" }}>
                  Prevision y compensacion (informativo)
                </p>
                <label>
                  Salud
                  <input
                    value={form.healthProvider}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, healthProvider: event.target.value } : current))
                    }
                  />
                </label>
                <label>
                  AFP
                  <input
                    value={form.pensionFund}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, pensionFund: event.target.value } : current))
                    }
                  />
                </label>
                <label>
                  Sueldo base
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.baseSalary}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, baseSalary: event.target.value } : current))
                    }
                  />
                </label>
                <label>
                  Bono colacion
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.mealAllowance}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, mealAllowance: event.target.value } : current))
                    }
                  />
                </label>
                <label>
                  Bono locomocion
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.transportAllowance}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, transportAllowance: event.target.value } : current))
                    }
                  />
                </label>
                <label>
                  Bonos otros
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.otherBonuses}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, otherBonuses: event.target.value } : current))
                    }
                  />
                </label>
                <div className="toolbar">
                  <button className="btn-primary" type="submit" disabled={saving || !hasChanges}>
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={saving || !hasChanges}
                    onClick={() => setForm(buildEditablePersonForm(data.person))}
                  >
                    Revertir
                  </button>
                </div>
              </form>
            ) : null}

            <div className="detail-grid">
              <div className="detail-item">
                <strong>RUT normalizado</strong>
                <p>{data.person.rutNormalized || "No aplica (pendiente)"}</p>
              </div>
              <div className="detail-item">
                <strong>Contrato principal (ficha)</strong>
                <p>{data.contract?.name || "Sin contrato asociado"}</p>
              </div>
              <div className="detail-item">
                <strong>Asignaciones activas</strong>
                <p>{activeAssignmentContracts.length ? activeAssignmentContracts.join(", ") : "Sin asignaciones activas"}</p>
              </div>
              <div className="detail-item">
                <strong>Correo</strong>
                <p>{data.person.email || "-"}</p>
              </div>
              <div className="detail-item">
                <strong>Telefono</strong>
                <p>{data.person.phone || "-"}</p>
              </div>
              <div className="detail-item">
                <strong>Funcion</strong>
                <p>{data.person.jobFunction || "-"}</p>
              </div>
              <div className="detail-item">
                <strong>Tipo contrato</strong>
                <p>{data.person.employmentType || "-"}</p>
              </div>
              <div className="detail-item">
                <strong>Codigo / OC</strong>
                <p>
                  {data.person.externalCode || "-"} / {data.person.purchaseOrder || "-"}
                </p>
              </div>
            </div>
          </Panel>
          ) : null}

          {activeTab === "summary" ? (
          <Panel title="Origen y trazabilidad laboral">
            <div className="detail-grid">
              <div className="detail-item">
                <strong>Candidato origen</strong>
                <p>{data.sourceCandidate?.name || "Sin vinculacion"}</p>
              </div>
              <div className="detail-item">
                <strong>Etapa al contratar</strong>
                <p>{data.sourceCandidate?.stage || "-"}</p>
              </div>
              <div className="detail-item">
                <strong>Vacante origen</strong>
                <p>{data.sourceVacancy?.title || "-"}</p>
              </div>
              <div className="detail-item">
                <strong>Area vacante</strong>
                <p>{data.sourceVacancy?.area || "-"}</p>
              </div>
            </div>
          </Panel>
          ) : null}

          {activeTab === "documents" ? (
          <Panel title="Documentos de persona">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Archivo</th>
                    <th>Vencimiento</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.documents.length === 0 ? (
                    <tr className="table-empty-row">
                      <td colSpan={5}>
                        <EmptyState message="Sin documentos asociados." />
                      </td>
                    </tr>
                  ) : null}
                  {data.documents.map((document) => {
                    const busy = documentActionPendingId === document.id;
                    return (
                      <tr key={document.id}>
                        <td>{document.docType}</td>
                        <td>{document.fileName}</td>
                        <td>{formatDate(document.expiryDate)}</td>
                        <td>{document.status}</td>
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

          {activeTab === "accreditation" ? (
          <>
            <Panel title="Indicadores de acreditacion">
              <div className="detail-grid">
                {data.accreditation.indicators.length === 0 ? (
                  <EmptyState message="Aun no hay contratos activos para evaluar acreditacion." />
                ) : null}
                {data.accreditation.indicators.map((indicator) => (
                  <div className="detail-item" key={indicator.contractId}>
                    <strong>{indicator.contractName}</strong>
                    <p>
                      {indicator.summary.compliant + indicator.summary.reused}/{indicator.summary.total} al dia
                    </p>
                    <p>
                      Pendientes: {indicator.summary.pending} | Vencidos: {indicator.summary.expired}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
            <HrAccreditationPanel fixedPersonId={personId} />
          </>
          ) : null}

          {activeTab === "payroll" ? (
          <Panel title="Nomina resumen (ALFA)">
            <p>Se muestra resumen historico sin motor de calculo interno en esta fase.</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Periodo</th>
                    <th>Haberes</th>
                    <th>Liquido</th>
                    <th>Moneda</th>
                    <th>Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payroll.records.length === 0 ? (
                    <tr className="table-empty-row">
                      <td colSpan={5}>
                        <EmptyState message="Aun no hay registros de nomina para esta persona." />
                      </td>
                    </tr>
                  ) : null}
                  {data.payroll.records.map((record) => (
                    <tr key={record.id}>
                      <td>{record.period}</td>
                      <td>{formatCurrency(record.grossIncome)}</td>
                      <td>{formatCurrency(record.netIncome)}</td>
                      <td>{record.currency}</td>
                      <td>{record.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="detail-grid">
              {data.payroll.placeholders.map((placeholder) => (
                <div className="detail-item" key={placeholder}>
                  <strong>Escalamiento</strong>
                  <p>{placeholder}</p>
                </div>
              ))}
            </div>
          </Panel>
          ) : null}

          {activeTab === "audit" ? (
          <Panel title="Timeline de auditoria">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Coleccion</th>
                    <th>Evento</th>
                    <th>Actor</th>
                    <th>Cambios</th>
                  </tr>
                </thead>
                <tbody>
                  {data.timeline.length === 0 ? (
                    <tr className="table-empty-row">
                      <td colSpan={5}>
                        <EmptyState message="Sin eventos de auditoria para esta persona." />
                      </td>
                    </tr>
                  ) : null}
                  {data.timeline.map((event) => (
                    <tr key={event.id}>
                      <td>{formatDateTime(event.createdAt)}</td>
                      <td>{event.collection}</td>
                      <td>
                        <span className={eventPillClass(event.eventType)}>{event.eventType}</span>
                      </td>
                      <td>{event.actor.email || event.actor.uid || event.actor.source}</td>
                      <td>{event.changedFields.join(", ") || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          ) : null}
        </>
      ) : null}
    </ModulePage>
  );
}
