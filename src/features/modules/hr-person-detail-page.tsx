"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, InlineError, KpiGrid, ModulePage, Panel, SkeletonRows, Toast } from "@/features/modules/module-ui";
import { useCrudModule } from "@/features/modules/use-crud-module";
import { formatCurrency, formatDate } from "@/lib/format";
import { useApiClient } from "@/lib/api/use-api-client";
import { EMPLOYMENT_STATUSES } from "@/types/catalogs";
import type {
  AuditLogEntry,
  Candidate,
  Contract,
  EmploymentStatus,
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
};

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

export function HrPersonDetailPage({ personId }: { personId: string }) {
  const api = useApiClient();
  const contractsApi = useCrudModule<Contract>("/api/contracts");
  const [data, setData] = useState<PersonDetailResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "success" | "error" } | null>(null);
  const [form, setForm] = useState<EditablePersonForm | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<PersonDetailResponse>(`/api/hr/people/${personId}`);
      setData(response.data);
      setForm({
        fullName: response.data.person.fullName,
        idNumber: response.data.person.idNumber,
        position: response.data.person.position,
        contractId: response.data.person.contractId || "",
        hireDate: response.data.person.hireDate,
        employmentStatus: response.data.person.employmentStatus
      });
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
    return (
      form.fullName !== data.person.fullName ||
      form.idNumber !== data.person.idNumber ||
      form.position !== data.person.position ||
      form.contractId !== (data.person.contractId || "") ||
      form.hireDate !== data.person.hireDate ||
      form.employmentStatus !== data.person.employmentStatus
    );
  }, [data, form]);

  const saveChanges = useCallback(async () => {
    if (!data || !form || saving || !hasChanges) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch("/api/hr/people", {
        id: data.person.id,
        fullName: form.fullName,
        idNumber: form.idNumber,
        position: form.position,
        contractId: form.contractId || null,
        hireDate: form.hireDate,
        employmentStatus: form.employmentStatus
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

  const compliantDocuments = useMemo(
    () =>
      data?.documents.filter((document) => document.status !== "expired").length || 0,
    [data?.documents]
  );

  return (
    <ModulePage
      title={data ? `Ficha 360 - ${data.person.fullName}` : "Ficha 360 de persona"}
      description="Vista integral de datos maestros, estado laboral, documentos, nomina resumen y trazabilidad."
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
                  Contrato
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
                <div className="toolbar">
                  <button className="btn-primary" type="submit" disabled={saving || !hasChanges}>
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={saving || !hasChanges}
                    onClick={() =>
                      setForm({
                        fullName: data.person.fullName,
                        idNumber: data.person.idNumber,
                        position: data.person.position,
                        contractId: data.person.contractId || "",
                        hireDate: data.person.hireDate,
                        employmentStatus: data.person.employmentStatus
                      })
                    }
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
                <strong>Contrato actual</strong>
                <p>{data.contract?.name || "Sin contrato asociado"}</p>
              </div>
            </div>
          </Panel>

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

          <Panel title="Documentos de persona">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Archivo</th>
                    <th>Vencimiento</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.documents.length === 0 ? (
                    <tr className="table-empty-row">
                      <td colSpan={4}>
                        <EmptyState message="Sin documentos asociados." />
                      </td>
                    </tr>
                  ) : null}
                  {data.documents.map((document) => (
                    <tr key={document.id}>
                      <td>{document.docType}</td>
                      <td>{document.fileName}</td>
                      <td>{formatDate(document.expiryDate)}</td>
                      <td>{document.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

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
        </>
      ) : null}
    </ModulePage>
  );
}
