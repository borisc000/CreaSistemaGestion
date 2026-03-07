"use client";

import clsx from "clsx";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { useCrudModule } from "@/features/modules/use-crud-module";
import { formatDate } from "@/lib/format";
import { useApiClient } from "@/lib/api/use-api-client";
import type { Contract, OperationTask, OperationTaskStatus } from "@/types/domain";

const STATUSES: OperationTaskStatus[] = ["todo", "doing", "blocked", "done"];

function resolveStatusFromDropTarget(overId: string | number, tasks: OperationTask[]): OperationTaskStatus | null {
  const normalized = String(overId);
  if (normalized.startsWith("status-")) {
    const candidateStatus = normalized.replace("status-", "");
    if (STATUSES.includes(candidateStatus as OperationTaskStatus)) {
      return candidateStatus as OperationTaskStatus;
    }
  }

  const targetTask = tasks.find((task) => task.id === normalized);
  return targetTask?.status || null;
}

function StatusDropZone({
  status,
  count,
  children
}: {
  status: OperationTaskStatus;
  count: number;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `status-${status}`
  });

  return (
    <section className={clsx("kanban-column", isOver && "is-over")} ref={setNodeRef}>
      <header className="stage-head">
        <h3>{status}</h3>
        <span className="stage-count">{count}</span>
      </header>
      {children}
    </section>
  );
}

function SortableTaskCard({
  task,
  contractName
}: {
  task: OperationTask;
  contractName: string;
}) {
  const { attributes, listeners, isDragging, setNodeRef, transform, transition } = useSortable({
    id: task.id
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <article
      className={clsx("task-card", isDragging && "is-dragging")}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-label={`Mover tarea ${task.title}`}
    >
      <strong>{task.title}</strong>
      <p>{contractName}</p>
      <p>{task.owner}</p>
      <p>Vence: {formatDate(task.dueDate)}</p>
    </article>
  );
}

export function OperationsPage() {
  const api = useApiClient();
  const operationsApi = useCrudModule<OperationTask>("/api/operations");
  const contractsApi = useCrudModule<Contract>("/api/contracts");
  const [boardTasks, setBoardTasks] = useState<OperationTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isCreateDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "success" | "error" } | null>(null);

  const [form, setForm] = useState({
    contractId: "",
    title: "",
    owner: "",
    priority: "medium" as "low" | "medium" | "high",
    dueDate: "",
    status: "todo" as OperationTaskStatus
  });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    setBoardTasks(operationsApi.items);
  }, [operationsApi.items]);

  const activeTask = useMemo(
    () => boardTasks.find((task) => task.id === activeTaskId) || null,
    [activeTaskId, boardTasks]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id));
    setInteractionError(null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const draggedTaskId = String(event.active.id);
      setActiveTaskId(null);

      if (!event.over) return;
      const movingTask = boardTasks.find((task) => task.id === draggedTaskId);
      if (!movingTask) return;

      const targetStatus = resolveStatusFromDropTarget(event.over.id, boardTasks);
      if (!targetStatus || targetStatus === movingTask.status) return;

      const previousTasks = boardTasks;
      setBoardTasks((current) =>
        current.map((task) => (task.id === movingTask.id ? { ...task, status: targetStatus } : task))
      );

      try {
        await api.patch("/api/operations", {
          id: movingTask.id,
          status: targetStatus
        });
        await operationsApi.reload();
        setToast({ message: `Tarea movida a ${targetStatus}.`, tone: "success" });
      } catch (error) {
        setBoardTasks(previousTasks);
        const message = error instanceof Error ? error.message : "No se pudo mover la tarea.";
        setInteractionError(message);
        setToast({ message: "No se pudo mover la tarea. Se revirtio el cambio.", tone: "error" });
      }
    },
    [api, boardTasks, operationsApi]
  );

  return (
    <ModulePage title="Operaciones" description="Seguimiento operativo por contrato y estado de tareas.">
      <Toast message={toast?.message || null} tone={toast?.tone || "info"} />
      <KpiGrid
        items={[
          { label: "Total tareas", value: boardTasks.length },
          { label: "Pendientes", value: boardTasks.filter((item) => item.status === "todo").length },
          { label: "Bloqueadas", value: boardTasks.filter((item) => item.status === "blocked").length },
          { label: "Completadas", value: boardTasks.filter((item) => item.status === "done").length }
        ]}
      />
      <ModuleActionBar>
        <button className="btn-primary" type="button" onClick={() => setCreateDrawerOpen(true)}>
          Agregar tarea
        </button>
      </ModuleActionBar>

      <FormDrawer
        isOpen={isCreateDrawerOpen}
        title="Agregar tarea operativa"
        description="Crea una tarea y su etapa inicial para el tablero."
        onClose={() => setCreateDrawerOpen(false)}
      >
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void operationsApi.create(form).then((ok) => {
              if (!ok) {
                setToast({ message: "No se pudo crear tarea.", tone: "error" });
                return;
              }
              setForm({ contractId: "", title: "", owner: "", priority: "medium", dueDate: "", status: "todo" });
              setToast({ message: "Tarea creada.", tone: "success" });
              setCreateDrawerOpen(false);
            });
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
            Estado inicial
            <select value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value as OperationTaskStatus }))}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" type="submit" disabled={operationsApi.pending === "saving"}>
            Guardar
          </button>
          <button className="btn-secondary" type="button" onClick={() => setCreateDrawerOpen(false)}>
            Cancelar
          </button>
        </form>
      </FormDrawer>

      <Panel title="Tablero operativo (drag & drop)">
        <p>Puedes arrastrar cualquier tarjeta con mouse/touch para mover tareas entre etapas.</p>
        <InlineError message={interactionError || operationsApi.error || contractsApi.error} />
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="kanban-grid">
            {STATUSES.map((status) => {
              const stageTasks = boardTasks.filter((task) => task.status === status);
              return (
                <StatusDropZone status={status} count={stageTasks.length} key={status}>
                  <SortableContext items={stageTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                    {stageTasks.length === 0 ? <EmptyState message="Sin tareas en esta etapa." /> : null}
                    {stageTasks.map((task) => {
                      const contract = contractsApi.items.find((item) => item.id === task.contractId);
                      return (
                        <SortableTaskCard
                          task={task}
                          contractName={contract?.name || "Sin contrato"}
                          key={task.id}
                        />
                      );
                    })}
                  </SortableContext>
                </StatusDropZone>
              );
            })}
          </div>

          <DragOverlay>
            {activeTask ? (
              <article className="task-card is-dragging">
                <strong>{activeTask.title}</strong>
                <p>{activeTask.owner}</p>
                <p>Vence: {formatDate(activeTask.dueDate)}</p>
              </article>
            ) : null}
          </DragOverlay>
        </DndContext>
      </Panel>
    </ModulePage>
  );
}
