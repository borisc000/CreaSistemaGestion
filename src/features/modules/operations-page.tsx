"use client";

import { useState } from "react";
import { useCrudModule } from "@/features/modules/use-crud-module";
import { InlineError, KpiGrid, ModulePage, Panel } from "@/features/modules/module-ui";
import { formatDate } from "@/lib/format";
import type { Contract, OperationTask, OperationTaskStatus } from "@/types/domain";

const STATUSES: OperationTaskStatus[] = ["todo", "doing", "blocked", "done"];

export function OperationsPage() {
  const operationsApi = useCrudModule<OperationTask>("/api/operations");
  const contractsApi = useCrudModule<Contract>("/api/contracts");

  const [form, setForm] = useState({
    contractId: "",
    title: "",
    owner: "",
    priority: "medium" as "low" | "medium" | "high",
    dueDate: "",
    status: "todo" as OperationTaskStatus
  });

  return (
    <ModulePage title="Operaciones" description="Seguimiento operativo por contrato y estado de tareas.">
      <KpiGrid
        items={[
          { label: "Total tareas", value: operationsApi.items.length },
          { label: "Pendientes", value: operationsApi.items.filter((item) => item.status === "todo").length },
          { label: "Bloqueadas", value: operationsApi.items.filter((item) => item.status === "blocked").length },
          { label: "Completadas", value: operationsApi.items.filter((item) => item.status === "done").length }
        ]}
      />

      <Panel title="Nueva tarea operativa">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void operationsApi.create(form);
            setForm({ contractId: "", title: "", owner: "", priority: "medium", dueDate: "", status: "todo" });
          }}
        >
          <label>
            Contrato
            <select value={form.contractId} onChange={(e) => setForm((v) => ({ ...v, contractId: e.target.value }))} required>
              <option value="">Selecciona</option>
              {contractsApi.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Titulo
            <input value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} required />
          </label>
          <label>
            Responsable
            <input value={form.owner} onChange={(e) => setForm((v) => ({ ...v, owner: e.target.value }))} required />
          </label>
          <label>
            Prioridad
            <select value={form.priority} onChange={(e) => setForm((v) => ({ ...v, priority: e.target.value as "low" | "medium" | "high" }))}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <label>
            Fecha limite
            <input type="date" value={form.dueDate} onChange={(e) => setForm((v) => ({ ...v, dueDate: e.target.value }))} required />
          </label>
          <label>
            Estado
            <select value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value as OperationTaskStatus }))}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" type="submit">Guardar</button>
        </form>
      </Panel>

      <Panel title="Tablero operativo">
        <InlineError message={operationsApi.error || contractsApi.error} />
        <div className="kanban-grid">
          {STATUSES.map((status) => (
            <section className="kanban-column" key={status}>
              <h3>{status}</h3>
              {operationsApi.items
                .filter((task) => task.status === status)
                .map((task) => {
                  const contract = contractsApi.items.find((item) => item.id === task.contractId);
                  return (
                    <article className="task-card" key={task.id}>
                      <strong>{task.title}</strong>
                      <p>{contract?.name || "Sin contrato"}</p>
                      <p>{task.owner}</p>
                      <p>Vence: {formatDate(task.dueDate)}</p>
                      <select value={task.status} onChange={(e) => void operationsApi.patch({ id: task.id, status: e.target.value })}>
                        {STATUSES.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </article>
                  );
                })}
            </section>
          ))}
        </div>
      </Panel>
    </ModulePage>
  );
}