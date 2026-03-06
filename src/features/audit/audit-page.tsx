"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApiClient } from "@/lib/api/use-api-client";
import type { AuditLogEntry } from "@/types/domain";
import { EmptyState, InlineError, ModulePage, Panel, SkeletonRows, Toast } from "@/features/modules/module-ui";

type AuditResponse = {
  data: AuditLogEntry[];
  cursor: string | null;
};

type AuditFilters = {
  module: string;
  eventType: "all" | "created" | "updated" | "deleted";
  actor: string;
  from: string;
  to: string;
};

const MODULE_OPTIONS = [
  "all",
  "tenders",
  "contracts",
  "operationTasks",
  "financeEntries",
  "vacancies",
  "candidates",
  "peopleRecords",
  "personDocuments"
];

function toQueryParams(params: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    search.set(key, value);
  }
  return search.toString();
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function eventPillClass(eventType: AuditLogEntry["eventType"]) {
  if (eventType === "created") return "pill pill-created";
  if (eventType === "deleted") return "pill pill-deleted";
  return "pill pill-updated";
}

export function AuditPage() {
  const api = useApiClient();
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "success" | "error" } | null>(null);

  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [formFilters, setFormFilters] = useState<AuditFilters>({
    module: "all",
    eventType: "all",
    actor: "",
    from: "",
    to: ""
  });
  const [activeFilters, setActiveFilters] = useState<AuditFilters>({
    module: "all",
    eventType: "all",
    actor: "",
    from: "",
    to: ""
  });

  const hasPreviousPage = cursorHistory.length > 0;

  const fetchAudit = useCallback(
    async (pageCursor?: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const queryString = toQueryParams({
          limit: "30",
          cursor: pageCursor || null,
          module: activeFilters.module === "all" ? null : activeFilters.module,
          eventType: activeFilters.eventType === "all" ? null : activeFilters.eventType,
          actor: activeFilters.actor.trim() || null,
          from: activeFilters.from || null,
          to: activeFilters.to || null
        });

        const response = await api.get<AuditResponse>(`/api/audit?${queryString}`);
        setItems(response.data);
        setNextCursor(response.cursor);
        setSelectedId(response.data[0]?.id || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar auditoria.");
        setToast({ message: "Error cargando auditoria.", tone: "error" });
      } finally {
        setLoading(false);
      }
    },
    [activeFilters, api]
  );

  useEffect(() => {
    void fetchAudit(cursor);
  }, [cursor, fetchAudit]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);

  return (
    <ModulePage
      title="Auditoria central"
      description="Trazabilidad de cambios por modulo, actor, evento y fecha con comparacion antes/despues."
    >
      <Toast message={toast?.message || null} tone={toast?.tone || "info"} />
      <Panel title="Filtros">
        <div className="toolbar">
          <label>
            Modulo
            <select
              value={formFilters.module}
              onChange={(event) => setFormFilters((current) => ({ ...current, module: event.target.value }))}
            >
              {MODULE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Evento
            <select
              value={formFilters.eventType}
              onChange={(event) =>
                setFormFilters((current) => ({
                  ...current,
                  eventType: event.target.value as AuditFilters["eventType"]
                }))
              }
            >
              <option value="all">all</option>
              <option value="created">created</option>
              <option value="updated">updated</option>
              <option value="deleted">deleted</option>
            </select>
          </label>
          <label>
            Actor (uid/email/rol)
            <input
              value={formFilters.actor}
              onChange={(event) => setFormFilters((current) => ({ ...current, actor: event.target.value }))}
            />
          </label>
          <label>
            Desde
            <input
              type="date"
              value={formFilters.from}
              onChange={(event) => setFormFilters((current) => ({ ...current, from: event.target.value }))}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={formFilters.to}
              onChange={(event) => setFormFilters((current) => ({ ...current, to: event.target.value }))}
            />
          </label>
          <button
            className="btn-primary"
            type="button"
            onClick={() => {
              setActiveFilters(formFilters);
              setCursorHistory([]);
              setCursor(null);
              setToast({ message: "Filtros aplicados.", tone: "info" });
            }}
          >
            Aplicar
          </button>
        </div>
        <InlineError message={error} />
      </Panel>

      <Panel
        title="Eventos auditados"
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-secondary"
              type="button"
              disabled={!hasPreviousPage || loading}
              onClick={() => {
                const previous = cursorHistory[cursorHistory.length - 1];
                setCursorHistory((current) => current.slice(0, -1));
                setCursor(previous || null);
              }}
            >
              Anterior
            </button>
            <button
              className="btn-secondary"
              type="button"
              disabled={!nextCursor || loading}
              onClick={() => {
                setCursorHistory((current) => [...current, cursor || ""]);
                setCursor(nextCursor);
              }}
            >
              Siguiente
            </button>
          </div>
        }
      >
        {loading ? <SkeletonRows rows={6} /> : null}
        {!loading && items.length === 0 ? <EmptyState message="Sin eventos para los filtros seleccionados." /> : null}

        {!loading && items.length > 0 ? (
          <div className="split-view">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Modulo</th>
                    <th>Evento</th>
                    <th>Entidad</th>
                    <th>Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      style={{
                        cursor: "pointer",
                        background: selectedId === item.id ? "rgba(15, 91, 157, 0.09)" : undefined
                      }}
                    >
                      <td>{formatDateTime(item.createdAt)}</td>
                      <td>{item.module}</td>
                      <td>
                        <span className={eventPillClass(item.eventType)}>{item.eventType}</span>
                      </td>
                      <td>{item.entityId}</td>
                      <td>{item.actor.email || item.actor.uid || item.actor.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="diff-box">
              {!selected ? (
                <EmptyState message="Selecciona un evento para ver su detalle." />
              ) : (
                <>
                  <h3>Detalle de cambio</h3>
                  <p>
                    <strong>{selected.module}</strong> / {selected.collection} / {selected.eventType}
                  </p>
                  <p>
                    Actor: {selected.actor.email || selected.actor.uid || "system"} ({selected.actor.role || "sin rol"})
                  </p>
                  <p>Campos modificados: {selected.changedFields.length || 0}</p>

                  {selected.changedFields.length > 0 ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Campo</th>
                            <th>Antes</th>
                            <th>Despues</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.changedFields.map((field) => (
                            <tr key={field}>
                              <td>{field}</td>
                              <td>{stringifyValue(selected.before?.[field])}</td>
                              <td>{stringifyValue(selected.after?.[field])}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState message="Sin campos detallados para este evento." />
                  )}

                  <div className="diff-grid">
                    <div>
                      <h3>Before</h3>
                      <pre>{stringifyValue(selected.before)}</pre>
                    </div>
                    <div>
                      <h3>After</h3>
                      <pre>{stringifyValue(selected.after)}</pre>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </Panel>
    </ModulePage>
  );
}
