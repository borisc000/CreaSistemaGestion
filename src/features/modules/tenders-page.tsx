"use client";

import { useState } from "react";
import { useCrudModule } from "@/features/modules/use-crud-module";
import {
  EmptyState,
  FormDrawer,
  InlineError,
  KpiGrid,
  ModuleActionBar,
  ModulePage,
  Panel,
  Toast
} from "@/features/modules/module-ui";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Tender, TenderStatus } from "@/types/domain";

const STATUSES: TenderStatus[] = ["draft", "submitted", "won", "lost"];

export function TendersPage() {
  const { items, error, pending, create, patch } = useCrudModule<Tender>("/api/tenders");
  const [toast, setToast] = useState<{ message: string; tone: "info" | "success" | "error" } | null>(null);
  const [isCreateDrawerOpen, setCreateDrawerOpen] = useState(false);
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
      <Toast message={toast?.message || null} tone={toast?.tone || "info"} />
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
      <ModuleActionBar>
        <button className="btn-primary" type="button" onClick={() => setCreateDrawerOpen(true)}>
          Agregar licitacion
        </button>
      </ModuleActionBar>

      <FormDrawer
        isOpen={isCreateDrawerOpen}
        title="Agregar licitacion"
        description="Completa los datos base para crear una oportunidad."
        onClose={() => setCreateDrawerOpen(false)}
      >
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void create(form).then((ok) => {
              if (!ok) {
                setToast({ message: "No se pudo crear licitacion.", tone: "error" });
                return;
              }
              setToast({ message: "Licitacion creada.", tone: "success" });
              setCreateDrawerOpen(false);
              setForm({
                title: "",
                client: "",
                amount: 0,
                closeDate: "",
                probability: 50,
                responsible: "",
                status: "draft"
              });
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
            Monto
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
          <button className="btn-secondary" type="button" onClick={() => setCreateDrawerOpen(false)}>
            Cancelar
          </button>
        </form>
      </FormDrawer>

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
                      onChange={(e) =>
                        void patch({ id: item.id, status: e.target.value as TenderStatus }).then((ok) => {
                          setToast({
                            message: ok ? "Estado de licitacion actualizado." : "No se pudo actualizar estado.",
                            tone: ok ? "success" : "error"
                          });
                        })
                      }
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
