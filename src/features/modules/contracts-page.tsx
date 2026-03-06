"use client";

import { useMemo, useState } from "react";
import { useCrudModule } from "@/features/modules/use-crud-module";
import { InlineError, KpiGrid, ModulePage, Panel } from "@/features/modules/module-ui";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Contract, ContractStatus, Tender } from "@/types/domain";

const STATUSES: ContractStatus[] = ["planning", "active", "at_risk", "closed"];

export function ContractsPage() {
  const contractsApi = useCrudModule<Contract>("/api/contracts");
  const tendersApi = useCrudModule<Tender>("/api/tenders");

  const wonTenders = useMemo(() => tendersApi.items.filter((item) => item.status === "won"), [tendersApi.items]);

  const [form, setForm] = useState({
    tenderId: "",
    name: "",
    client: "",
    totalValue: 0,
    costEstimate: 0,
    startDate: "",
    endDate: "",
    manager: "",
    status: "planning" as ContractStatus,
    progress: 0
  });

  const margin = contractsApi.items.reduce((acc, item) => acc + (item.totalValue - item.costEstimate), 0);

  return (
    <ModulePage title="Contratos" description="Cartera adjudicada y control de margen/avance.">
      <KpiGrid
        items={[
          { label: "Total contratos", value: contractsApi.items.length },
          { label: "Activos", value: contractsApi.items.filter((item) => item.status === "active" || item.status === "at_risk").length },
          { label: "En riesgo", value: contractsApi.items.filter((item) => item.status === "at_risk").length },
          { label: "Margen esperado", value: formatCurrency(margin) }
        ]}
      />

      <Panel title="Nuevo contrato">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void contractsApi.create({ ...form, tenderId: form.tenderId || null });
            setForm({
              tenderId: "",
              name: "",
              client: "",
              totalValue: 0,
              costEstimate: 0,
              startDate: "",
              endDate: "",
              manager: "",
              status: "planning",
              progress: 0
            });
          }}
        >
          <label>
            Nombre
            <input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} required />
          </label>
          <label>
            Cliente
            <input value={form.client} onChange={(e) => setForm((v) => ({ ...v, client: e.target.value }))} required />
          </label>
          <label>
            Licitacion ganada
            <select value={form.tenderId} onChange={(e) => setForm((v) => ({ ...v, tenderId: e.target.value }))}>
              <option value="">Sin vinculacion</option>
              {wonTenders.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Valor total
            <input type="number" min={0} value={form.totalValue} onChange={(e) => setForm((v) => ({ ...v, totalValue: Number(e.target.value) }))} required />
          </label>
          <label>
            Costo estimado
            <input type="number" min={0} value={form.costEstimate} onChange={(e) => setForm((v) => ({ ...v, costEstimate: Number(e.target.value) }))} required />
          </label>
          <label>
            Inicio
            <input type="date" value={form.startDate} onChange={(e) => setForm((v) => ({ ...v, startDate: e.target.value }))} required />
          </label>
          <label>
            Termino
            <input type="date" value={form.endDate} onChange={(e) => setForm((v) => ({ ...v, endDate: e.target.value }))} required />
          </label>
          <label>
            Manager
            <input value={form.manager} onChange={(e) => setForm((v) => ({ ...v, manager: e.target.value }))} required />
          </label>
          <label>
            Estado
            <select value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value as ContractStatus }))}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Avance
            <input type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm((v) => ({ ...v, progress: Number(e.target.value) }))} />
          </label>
          <button className="btn-primary" type="submit">Guardar</button>
        </form>
      </Panel>

      <Panel title="Listado">
        <InlineError message={contractsApi.error || tendersApi.error} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Cliente</th>
                <th>Valor</th>
                <th>Costo</th>
                <th>Margen %</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {contractsApi.items.map((item) => {
                const marginPct = item.totalValue > 0 ? (((item.totalValue - item.costEstimate) / item.totalValue) * 100).toFixed(1) : "0.0";
                return (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.client}</td>
                    <td>{formatCurrency(item.totalValue)}</td>
                    <td>{formatCurrency(item.costEstimate)}</td>
                    <td>{marginPct}%</td>
                    <td>{formatDate(item.startDate)}</td>
                    <td>{formatDate(item.endDate)}</td>
                    <td>
                      <select value={item.status} onChange={(e) => void contractsApi.patch({ id: item.id, status: e.target.value })}>
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
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