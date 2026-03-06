"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, InlineError, KpiGrid, ModulePage, Panel, SkeletonRows } from "@/features/modules/module-ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { useApiClient } from "@/lib/api/use-api-client";
import type {
  AuditLogEntry,
  Candidate,
  Contract,
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
  const [data, setData] = useState<PersonDetailResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get<PersonDetailResponse>(`/api/hr/people/${personId}`);
        if (!mounted) return;
        setData(response.data);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar la ficha de persona.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [api, personId]);

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

      <InlineError message={error} />

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

          <Panel title="Resumen maestro">
            <div className="detail-grid">
              <div className="detail-item">
                <strong>Nombre</strong>
                <p>{data.person.fullName}</p>
              </div>
              <div className="detail-item">
                <strong>RUT / ID</strong>
                <p>{data.person.idNumber}</p>
              </div>
              <div className="detail-item">
                <strong>RUT normalizado</strong>
                <p>{data.person.rutNormalized || "No aplica (pendiente)"}</p>
              </div>
              <div className="detail-item">
                <strong>Cargo</strong>
                <p>{data.person.position}</p>
              </div>
              <div className="detail-item">
                <strong>Fecha ingreso</strong>
                <p>{formatDate(data.person.hireDate)}</p>
              </div>
              <div className="detail-item">
                <strong>Contrato</strong>
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
                        <EmptyState message="Aun no hay registros de nomina importados para esta persona." />
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
