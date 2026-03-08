"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  InlineError,
  KpiGrid,
  ModulePage,
  Panel,
  SkeletonRows,
  Toast
} from "@/features/modules/module-ui";
import { useCrudModule } from "@/features/modules/use-crud-module";
import { formatCurrency, formatDate } from "@/lib/format";
import type {
  Contract,
  ContractStatus,
  FinanceEntry,
  OperationTask,
  PersonRecord
} from "@/types/domain";

const STATUSES: ContractStatus[] = ["planning", "active", "at_risk", "closed"];

type EditableContractForm = {
  name: string;
  client: string;
  code: string;
  purchaseOrder: string;
  description: string;
  tenderId: string;
  totalValue: number;
  costEstimate: number;
  startDate: string;
  endDate: string;
  manager: string;
  status: ContractStatus;
  progress: number;
};

function buildForm(contract: Contract): EditableContractForm {
  return {
    name: contract.name,
    client: contract.client,
    code: contract.code || "",
    purchaseOrder: contract.purchaseOrder || "",
    description: contract.description || "",
    tenderId: contract.tenderId || "",
    totalValue: contract.totalValue,
    costEstimate: contract.costEstimate,
    startDate: contract.startDate,
    endDate: contract.endDate,
    manager: contract.manager,
    status: contract.status,
    progress: contract.progress
  };
}

export function ContractDetailPage({ contractId }: { contractId: string }) {
  const contractsApi = useCrudModule<Contract>("/api/contracts");
  const operationsApi = useCrudModule<OperationTask>("/api/operations");
  const financeApi = useCrudModule<FinanceEntry>("/api/finance");
  const peopleApi = useCrudModule<PersonRecord>("/api/hr/people");

  const [form, setForm] = useState<EditableContractForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "success" | "error" } | null>(null);

  const contract = useMemo(
    () => contractsApi.items.find((item) => item.id === contractId) || null,
    [contractId, contractsApi.items]
  );

  useEffect(() => {
    if (!contract) return;
    setForm(buildForm(contract));
  }, [contract]);

  const relatedOperations = useMemo(
    () => operationsApi.items.filter((item) => item.contractId === contractId),
    [contractId, operationsApi.items]
  );
  const relatedFinance = useMemo(
    () => financeApi.items.filter((item) => item.contractId === contractId),
    [contractId, financeApi.items]
  );
  const relatedPeople = useMemo(
    () => peopleApi.items.filter((item) => item.contractId === contractId),
    [contractId, peopleApi.items]
  );

  const hasChanges = useMemo(() => {
    if (!form || !contract) return false;
    const baseline = buildForm(contract);
    return (
      form.name !== baseline.name ||
      form.client !== baseline.client ||
      form.code !== baseline.code ||
      form.purchaseOrder !== baseline.purchaseOrder ||
      form.description !== baseline.description ||
      form.tenderId !== baseline.tenderId ||
      form.totalValue !== baseline.totalValue ||
      form.costEstimate !== baseline.costEstimate ||
      form.startDate !== baseline.startDate ||
      form.endDate !== baseline.endDate ||
      form.manager !== baseline.manager ||
      form.status !== baseline.status ||
      form.progress !== baseline.progress
    );
  }, [contract, form]);

  const financeSummary = useMemo(() => {
    return relatedFinance.reduce(
      (acc, entry) => {
        if (entry.type === "income") acc.income += entry.amount;
        if (entry.type === "expense") acc.expense += entry.amount;
        return acc;
      },
      { income: 0, expense: 0 }
    );
  }, [relatedFinance]);

  const loading =
    contractsApi.pending === "loading" ||
    operationsApi.pending === "loading" ||
    financeApi.pending === "loading" ||
    peopleApi.pending === "loading";

  return (
    <ModulePage
      title={contract ? `Ficha contrato - ${contract.name}` : "Ficha de contrato"}
      description="Detalle maestro del contrato con datos operativos asociados."
    >
      <Toast message={toast?.message || null} tone={toast?.tone || "info"} />
      <Panel
        title="Acciones"
        right={
          <Link className="btn-secondary" href="/contratos">
            Volver a contratos
          </Link>
        }
      >
        <p>La ficha consolida informacion clave, incluyendo codigo y OC del contrato.</p>
      </Panel>

      <InlineError
        message={contractsApi.error || operationsApi.error || financeApi.error || peopleApi.error}
      />

      {loading ? <SkeletonRows rows={8} /> : null}
      {!loading && !contract ? <EmptyState message="Contrato no encontrado." /> : null}

      {!loading && contract && form ? (
        <>
          <KpiGrid
            items={[
              { label: "Estado", value: contract.status },
              { label: "Dotacion ficha", value: relatedPeople.length },
              { label: "Tareas operativas", value: relatedOperations.length },
              { label: "Flujo neto", value: formatCurrency(financeSummary.income - financeSummary.expense) }
            ]}
          />

          <Panel title="Datos de contrato (editable)">
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                if (!hasChanges || saving) return;
                setSaving(true);
                void contractsApi
                  .patch({
                    id: contract.id,
                    name: form.name,
                    client: form.client,
                    code: form.code || null,
                    purchaseOrder: form.purchaseOrder || null,
                    description: form.description || null,
                    tenderId: form.tenderId || null,
                    totalValue: form.totalValue,
                    costEstimate: form.costEstimate,
                    startDate: form.startDate,
                    endDate: form.endDate,
                    manager: form.manager,
                    status: form.status,
                    progress: form.progress
                  })
                  .then((ok) => {
                    setToast({
                      message: ok ? "Ficha de contrato actualizada." : "No se pudo actualizar el contrato.",
                      tone: ok ? "success" : "error"
                    });
                  })
                  .finally(() => setSaving(false));
              }}
            >
              <label>
                Nombre
                <input value={form.name} onChange={(event) => setForm((v) => (v ? { ...v, name: event.target.value } : v))} required />
              </label>
              <label>
                Cliente
                <input value={form.client} onChange={(event) => setForm((v) => (v ? { ...v, client: event.target.value } : v))} required />
              </label>
              <label>
                Codigo contrato
                <input value={form.code} onChange={(event) => setForm((v) => (v ? { ...v, code: event.target.value } : v))} />
              </label>
              <label>
                OC
                <input
                  value={form.purchaseOrder}
                  onChange={(event) => setForm((v) => (v ? { ...v, purchaseOrder: event.target.value } : v))}
                />
              </label>
              <label>
                Descripcion / alcance
                <input
                  value={form.description}
                  onChange={(event) => setForm((v) => (v ? { ...v, description: event.target.value } : v))}
                />
              </label>
              <label>
                Valor total
                <input
                  type="number"
                  min={0}
                  value={form.totalValue}
                  onChange={(event) => setForm((v) => (v ? { ...v, totalValue: Number(event.target.value) } : v))}
                  required
                />
              </label>
              <label>
                Costo estimado
                <input
                  type="number"
                  min={0}
                  value={form.costEstimate}
                  onChange={(event) => setForm((v) => (v ? { ...v, costEstimate: Number(event.target.value) } : v))}
                  required
                />
              </label>
              <label>
                Inicio
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setForm((v) => (v ? { ...v, startDate: event.target.value } : v))}
                  required
                />
              </label>
              <label>
                Termino
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(event) => setForm((v) => (v ? { ...v, endDate: event.target.value } : v))}
                  required
                />
              </label>
              <label>
                Manager
                <input
                  value={form.manager}
                  onChange={(event) => setForm((v) => (v ? { ...v, manager: event.target.value } : v))}
                  required
                />
              </label>
              <label>
                Estado
                <select
                  value={form.status}
                  onChange={(event) => setForm((v) => (v ? { ...v, status: event.target.value as ContractStatus } : v))}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Avance %
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.progress}
                  onChange={(event) => setForm((v) => (v ? { ...v, progress: Number(event.target.value) } : v))}
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
                  onClick={() => setForm(buildForm(contract))}
                >
                  Revertir
                </button>
              </div>
            </form>
          </Panel>

          <Panel title="Resumen operativo del contrato">
            <div className="detail-grid">
              <div className="detail-item">
                <strong>Codigo / OC</strong>
                <p>
                  {contract.code || "-"} / {contract.purchaseOrder || "-"}
                </p>
              </div>
              <div className="detail-item">
                <strong>Rango contrato</strong>
                <p>
                  {formatDate(contract.startDate)} - {formatDate(contract.endDate)}
                </p>
              </div>
              <div className="detail-item">
                <strong>Dotacion (ficha principal)</strong>
                <p>{relatedPeople.length}</p>
              </div>
              <div className="detail-item">
                <strong>Ingresos registrados</strong>
                <p>{formatCurrency(financeSummary.income)}</p>
              </div>
              <div className="detail-item">
                <strong>Egresos registrados</strong>
                <p>{formatCurrency(financeSummary.expense)}</p>
              </div>
            </div>
          </Panel>

          <Panel title="Personas asociadas por ficha principal">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>RUT / ID</th>
                    <th>Cargo</th>
                    <th>Ingreso</th>
                    <th>Estado</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {relatedPeople.length === 0 ? (
                    <tr className="table-empty-row">
                      <td colSpan={6}>
                        <EmptyState message="No hay personas asociadas por ficha principal." />
                      </td>
                    </tr>
                  ) : null}
                  {relatedPeople.map((person) => (
                    <tr key={person.id}>
                      <td>{person.fullName}</td>
                      <td>{person.idNumber}</td>
                      <td>{person.position}</td>
                      <td>{formatDate(person.hireDate)}</td>
                      <td>{person.employmentStatus}</td>
                      <td>
                        <Link className="btn-secondary" href={`/rrhh/personas/${person.id}`}>
                          Ver ficha persona
                        </Link>
                      </td>
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
