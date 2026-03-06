"use client";

import { useMemo, useState } from "react";
import { useCrudModule } from "@/features/modules/use-crud-module";
import { InlineError, KpiGrid, ModulePage, Panel } from "@/features/modules/module-ui";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Contract, FinanceEntry } from "@/types/domain";

const ENTRY_TYPES = ["income", "expense"] as const;
const ENTRY_STATUSES = ["pending", "paid"] as const;

export function FinancePage() {
  const financeApi = useCrudModule<FinanceEntry>("/api/finance");
  const contractsApi = useCrudModule<Contract>("/api/contracts");

  const [form, setForm] = useState({
    contractId: "",
    type: "income" as "income" | "expense",
    concept: "",
    category: "",
    amount: 0,
    dueDate: "",
    status: "pending" as "pending" | "paid"
  });

  const monthTotals = useMemo(() => {
    const now = new Date();
    const monthItems = financeApi.items.filter((item) => {
      const date = new Date(item.dueDate);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });

    const income = monthItems
      .filter((item) => item.type === "income")
      .reduce((acc, item) => acc + item.amount, 0);
    const expense = monthItems
      .filter((item) => item.type === "expense")
      .reduce((acc, item) => acc + item.amount, 0);

    return {
      income,
      expense,
      net: income - expense
    };
  }, [financeApi.items]);

  return (
    <ModulePage title="Finanzas" description="Control financiero por contrato y flujo de caja operativo.">
      <KpiGrid
        items={[
          { label: "Movimientos", value: financeApi.items.length },
          { label: "Ingresos mes", value: formatCurrency(monthTotals.income) },
          { label: "Egresos mes", value: formatCurrency(monthTotals.expense) },
          { label: "Flujo neto mes", value: formatCurrency(monthTotals.net) }
        ]}
      />

      <Panel title="Nuevo movimiento financiero">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void financeApi.create(form);
            setForm({
              contractId: "",
              type: "income",
              concept: "",
              category: "",
              amount: 0,
              dueDate: "",
              status: "pending"
            });
          }}
        >
          <label>
            Contrato
            <select
              value={form.contractId}
              onChange={(event) => setForm((prev) => ({ ...prev, contractId: event.target.value }))}
              required
            >
              <option value="">Selecciona</option>
              {contractsApi.items.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo
            <select
              value={form.type}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, type: event.target.value as "income" | "expense" }))
              }
            >
              {ENTRY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Concepto
            <input
              value={form.concept}
              onChange={(event) => setForm((prev) => ({ ...prev, concept: event.target.value }))}
              required
            />
          </label>
          <label>
            Categoria
            <input
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              required
            />
          </label>
          <label>
            Monto
            <input
              type="number"
              min={0}
              value={form.amount}
              onChange={(event) => setForm((prev) => ({ ...prev, amount: Number(event.target.value) }))}
              required
            />
          </label>
          <label>
            Fecha
            <input
              type="date"
              value={form.dueDate}
              onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
              required
            />
          </label>
          <label>
            Estado
            <select
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, status: event.target.value as "pending" | "paid" }))
              }
            >
              {ENTRY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" type="submit" disabled={financeApi.pending === "saving"}>
            Guardar
          </button>
        </form>
      </Panel>

      <Panel title="Libro financiero">
        <InlineError message={financeApi.error || contractsApi.error} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Tipo</th>
                <th>Concepto</th>
                <th>Categoria</th>
                <th>Monto</th>
                <th>Fecha</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {financeApi.items.map((item) => {
                const contract = contractsApi.items.find((candidate) => candidate.id === item.contractId);
                return (
                  <tr key={item.id}>
                    <td>{contract?.name || "Contrato no encontrado"}</td>
                    <td>{item.type}</td>
                    <td>{item.concept}</td>
                    <td>{item.category}</td>
                    <td>{formatCurrency(item.amount)}</td>
                    <td>{formatDate(item.dueDate)}</td>
                    <td>
                      <select
                        value={item.status}
                        onChange={(event) =>
                          void financeApi.patch({
                            id: item.id,
                            status: event.target.value as "pending" | "paid"
                          })
                        }
                      >
                        {ENTRY_STATUSES.map((status) => (
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
