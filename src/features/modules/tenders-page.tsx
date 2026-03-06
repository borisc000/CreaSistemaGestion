"use client";

import { useState } from "react";
import { useCrudModule } from "@/features/modules/use-crud-module";
import { EmptyState, InlineError, KpiGrid, ModulePage, Panel } from "@/features/modules/module-ui";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Tender, TenderStatus } from "@/types/domain";

const STATUSES: TenderStatus[] = ["draft", "submitted", "won", "lost"];

export function TendersPage() {
  const { items, error, pending, create, patch } = useCrudModule<Tender>("/api/tenders");
  const [form, setForm] = useState({
    title: "",
    client: "",
    amount: 0,
    closeDate: "",
    probability: 50,
    responsible: "",
    status: "draft" as TenderStatus
  });

  const won = items.filter((item) => item.status === "won").length;
  const decided = items.filter((item) => item.status === "won" || item.status === "lost").length;
  const winRate = decided ? ((won / decided) * 100).toFixed(1) : "0.0";

  return (
    <ModulePage title="Licitaciones" description="Pipeline de oportunidades y adjudicaciones.">
      <KpiGrid
        items={[
          { label: "Total", value: items.length },
          { label: "Abiertas", value: items.filter((item) => item.status === "draft" || item.status === "submitted").length },
          { label: "Win rate", value: `${winRate}%` },
          {
            label: "Pipeline potencial",
            value: formatCurrency(items.filter((item) => item.status === "draft" || item.status === "submitted").reduce((acc, item) => acc + item.amount, 0))
          }
        ]}
      />

      <Panel title="Nueva licitacion">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void create(form);
            setForm({
              title: "",
              client: "",
              amount: 0,
              closeDate: "",
              probability: 50,
              responsible: "",
              status: "draft"
            });
          }}
        >
          <label>
            Nombre
            <input value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} required />
          </label>
          <label>
            Cliente
            <input value={form.client} onChange={(e) => setForm((v) => ({ ...v, client: e.target.value }))} required />
          </label>
          <label>
            Monto USD
            <input
              type="number"
              min={0}
              value={form.amount}
              onChange={(e) => setForm((v) => ({ ...v, amount: Number(e.target.value) }))}
              required
            />
          </label>
          <label>
            Cierre
            <input type="date" value={form.closeDate} onChange={(e) => setForm((v) => ({ ...v, closeDate: e.target.value }))} required />
          </label>
          <label>
            Probabilidad
            <input
              type="number"
              min={0}
              max={100}
              value={form.probability}
              onChange={(e) => setForm((v) => ({ ...v, probability: Number(e.target.value) }))}
              required
            />
          </label>
          <label>
            Responsable
            <input value={form.responsible} onChange={(e) => setForm((v) => ({ ...v, responsible: e.target.value }))} required />
          </label>
          <label>
            Estado
            <select value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value as TenderStatus }))}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" type="submit" disabled={pending === "saving"}>
            Guardar
          </button>
        </form>
      </Panel>

      <Panel title="Listado">
        <InlineError message={error} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Titulo</th>
                <th>Cliente</th>
                <th>Monto</th>
                <th>Cierre</th>
                <th>Prob.</th>
                <th>Responsable</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr className="table-empty-row">
                  <td colSpan={7}>
                    <EmptyState message="Aun no hay licitaciones cargadas." />
                  </td>
                </tr>
              ) : null}
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>{item.client}</td>
                  <td>{formatCurrency(item.amount)}</td>
                  <td>{formatDate(item.closeDate)}</td>
                  <td>{item.probability}%</td>
                  <td>{item.responsible}</td>
                  <td>
                    <select
                      value={item.status}
                      onChange={(e) => void patch({ id: item.id, status: e.target.value as TenderStatus })}
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </ModulePage>
  );
}
