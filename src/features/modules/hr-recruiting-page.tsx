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
import { formatCurrency, formatDate } from "@/lib/format";
import { useApiClient } from "@/lib/api/use-api-client";
import type { Candidate, CandidateStage, Contract, Vacancy, VacancyStatus } from "@/types/domain";

type RecruitingResponse = {
  data: {
    vacancies: Vacancy[];
    candidates: Candidate[];
  };
};

const VACANCY_STATUSES: VacancyStatus[] = ["open", "paused", "closed"];
const CANDIDATE_STAGES: CandidateStage[] = ["intake", "screening", "interview", "offer", "hired", "rejected"];

function stageBadgeClass(stage: CandidateStage): string {
  if (stage === "hired") return "badge badge-success";
  if (stage === "rejected") return "badge badge-danger";
  return "badge badge-warning";
}

function resolveStageFromDropTarget(overId: string | number, candidates: Candidate[]): CandidateStage | null {
  const normalized = String(overId);

  if (normalized.startsWith("stage-")) {
    const candidateStage = normalized.replace("stage-", "");
    if (CANDIDATE_STAGES.includes(candidateStage as CandidateStage)) {
      return candidateStage as CandidateStage;
    }
  }

  const targetCandidate = candidates.find((candidate) => candidate.id === normalized);
  return targetCandidate?.stage || null;
}

function StageDropZone({
  stage,
  count,
  children
}: {
  stage: CandidateStage;
  count: number;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `stage-${stage}`
  });

  return (
    <section className={clsx("stage-column", isOver && "is-over")} ref={setNodeRef}>
      <header className="stage-head">
        <h3>{stage}</h3>
        <span className="stage-count">{count}</span>
      </header>
      <div className="candidate-list">{children}</div>
    </section>
  );
}

function SortableCandidateCard({
  candidate,
  vacancy
}: {
  candidate: Candidate;
  vacancy: Vacancy | undefined;
}) {
  const { attributes, listeners, isDragging, setNodeRef, transform, transition } = useSortable({
    id: candidate.id
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <article
      className={clsx("candidate-card", isDragging && "is-dragging")}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-label={`Mover ${candidate.name}`}
    >
      <strong>{candidate.name}</strong>
      <p>{vacancy?.title || "Vacante no encontrada"}</p>
      <p>{candidate.source}</p>
      <p>{formatCurrency(candidate.salary)}</p>
      <span className={stageBadgeClass(candidate.stage)}>{candidate.stage}</span>
    </article>
  );
}

export function HrRecruitingPage() {
  const api = useApiClient();
  const contractsApi = useCrudModule<Contract>("/api/contracts");

  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "success" | "error" } | null>(null);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [isVacancyDrawerOpen, setVacancyDrawerOpen] = useState(false);
  const [isCandidateDrawerOpen, setCandidateDrawerOpen] = useState(false);

  const [vacancyForm, setVacancyForm] = useState({
    title: "",
    area: "",
    contractId: "",
    openings: 1,
    targetDate: "",
    status: "open" as VacancyStatus
  });

  const [candidateForm, setCandidateForm] = useState({
    vacancyId: "",
    name: "",
    source: "",
    salary: 0,
    stage: "intake" as CandidateStage,
    hiredAt: ""
  });

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const response = await api.get<RecruitingResponse>("/api/hr/recruiting");
      setVacancies(response.data.vacancies);
      setCandidates(response.data.candidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar reclutamiento.");
    } finally {
      setPending(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCandidates = useMemo(
    () => candidates.filter((item) => item.stage !== "hired" && item.stage !== "rejected").length,
    [candidates]
  );

  const activeDragCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === activeCandidateId) || null,
    [activeCandidateId, candidates]
  );

  const submitVacancy = useCallback(async (): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      await api.post("/api/hr/recruiting", {
        resource: "vacancy",
        payload: {
          ...vacancyForm,
          contractId: vacancyForm.contractId || null,
          targetDate: vacancyForm.targetDate || null
        }
      });

      setVacancyForm({ title: "", area: "", contractId: "", openings: 1, targetDate: "", status: "open" });
      await load();
      setToast({ message: "Vacante creada.", tone: "success" });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear vacante.");
      setPending(false);
      return false;
    }
  }, [api, load, vacancyForm]);

  const submitCandidate = useCallback(async (): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      await api.post("/api/hr/recruiting", {
        resource: "candidate",
        payload: {
          ...candidateForm,
          hiredAt: candidateForm.hiredAt || null
        }
      });

      setCandidateForm({ vacancyId: "", name: "", source: "", salary: 0, stage: "intake", hiredAt: "" });
      await load();
      setToast({ message: "Candidato creado.", tone: "success" });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear candidato.");
      setPending(false);
      return false;
    }
  }, [api, candidateForm, load]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveCandidateId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const draggedCandidateId = String(event.active.id);
      setActiveCandidateId(null);

      if (!event.over) return;
      const movingCandidate = candidates.find((candidate) => candidate.id === draggedCandidateId);
      if (!movingCandidate) return;

      const targetStage = resolveStageFromDropTarget(event.over.id, candidates);
      if (!targetStage || targetStage === movingCandidate.stage) {
        return;
      }

      const previousCandidates = candidates;
      const optimisticCandidates = candidates.map((candidate) =>
        candidate.id === movingCandidate.id
          ? {
              ...candidate,
              stage: targetStage,
              hiredAt: targetStage === "hired" && !candidate.hiredAt ? new Date().toISOString().slice(0, 10) : candidate.hiredAt
            }
          : candidate
      );
      setCandidates(optimisticCandidates);

      try {
        await api.patch("/api/hr/recruiting", {
          resource: "candidate",
          payload: {
            id: movingCandidate.id,
            stage: targetStage,
            hiredAt: targetStage === "hired" && !movingCandidate.hiredAt ? new Date().toISOString().slice(0, 10) : movingCandidate.hiredAt
          }
        });
        setToast({ message: `Candidato movido a ${targetStage}.`, tone: "success" });
      } catch (err) {
        setCandidates(previousCandidates);
        setError(err instanceof Error ? err.message : "No se pudo actualizar etapa del candidato.");
        setToast({ message: "No se pudo mover candidato, se revirtio el cambio.", tone: "error" });
      }
    },
    [api, candidates]
  );

  return (
    <ModulePage
      title="RRHH - Reclutamiento y seleccion"
      description="Gestion de vacantes por contrato y seguimiento de candidatos por etapa."
    >
      <Toast message={toast?.message || null} tone={toast?.tone || "info"} />
      <KpiGrid
        items={[
          { label: "Vacantes", value: vacancies.length },
          { label: "Vacantes abiertas", value: vacancies.filter((item) => item.status === "open").length },
          { label: "Candidatos", value: candidates.length },
          { label: "Candidatos activos", value: activeCandidates }
        ]}
      />
      <ModuleActionBar>
        <button className="btn-primary" type="button" onClick={() => setVacancyDrawerOpen(true)}>
          Agregar vacante
        </button>
        <button className="btn-secondary" type="button" onClick={() => setCandidateDrawerOpen(true)}>
          Agregar candidato
        </button>
      </ModuleActionBar>

      <FormDrawer
        isOpen={isVacancyDrawerOpen}
        title="Agregar vacante"
        description="Registra una vacante asociada o no a contrato."
        onClose={() => setVacancyDrawerOpen(false)}
      >
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void submitVacancy().then((ok) => {
              if (ok) {
                setVacancyDrawerOpen(false);
              }
            });
          }}
        >
          <label>
            Cargo
            <input
              value={vacancyForm.title}
              onChange={(event) => setVacancyForm((prev) => ({ ...prev, title: event.target.value }))}
              required
            />
          </label>
          <label>
            Area
            <input
              value={vacancyForm.area}
              onChange={(event) => setVacancyForm((prev) => ({ ...prev, area: event.target.value }))}
              required
            />
          </label>
          <label>
            Contrato asociado
            <select
              value={vacancyForm.contractId}
              onChange={(event) => setVacancyForm((prev) => ({ ...prev, contractId: event.target.value }))}
            >
              <option value="">Sin vinculacion</option>
              {contractsApi.items.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cupos
            <input
              type="number"
              min={1}
              value={vacancyForm.openings}
              onChange={(event) => setVacancyForm((prev) => ({ ...prev, openings: Number(event.target.value) }))}
              required
            />
          </label>
          <label>
            Fecha objetivo
            <input
              type="date"
              value={vacancyForm.targetDate}
              onChange={(event) => setVacancyForm((prev) => ({ ...prev, targetDate: event.target.value }))}
            />
          </label>
          <label>
            Estado
            <select
              value={vacancyForm.status}
              onChange={(event) => setVacancyForm((prev) => ({ ...prev, status: event.target.value as VacancyStatus }))}
            >
              {VACANCY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" type="submit" disabled={pending}>
            Guardar vacante
          </button>
          <button className="btn-secondary" type="button" onClick={() => setVacancyDrawerOpen(false)}>
            Cancelar
          </button>
        </form>
      </FormDrawer>

      <FormDrawer
        isOpen={isCandidateDrawerOpen}
        title="Agregar candidato"
        description="Ingresa un candidato y su etapa inicial."
        onClose={() => setCandidateDrawerOpen(false)}
      >
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCandidate().then((ok) => {
              if (ok) {
                setCandidateDrawerOpen(false);
              }
            });
          }}
        >
          <label>
            Vacante
            <select
              value={candidateForm.vacancyId}
              onChange={(event) => setCandidateForm((prev) => ({ ...prev, vacancyId: event.target.value }))}
              required
            >
              <option value="">Selecciona</option>
              {vacancies.map((vacancy) => (
                <option key={vacancy.id} value={vacancy.id}>
                  {vacancy.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nombre
            <input
              value={candidateForm.name}
              onChange={(event) => setCandidateForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </label>
          <label>
            Fuente
            <input
              value={candidateForm.source}
              onChange={(event) => setCandidateForm((prev) => ({ ...prev, source: event.target.value }))}
              required
            />
          </label>
          <label>
            Renta esperada
            <input
              type="number"
              min={0}
              value={candidateForm.salary}
              onChange={(event) => setCandidateForm((prev) => ({ ...prev, salary: Number(event.target.value) }))}
              required
            />
          </label>
          <label>
            Etapa
            <select
              value={candidateForm.stage}
              onChange={(event) => setCandidateForm((prev) => ({ ...prev, stage: event.target.value as CandidateStage }))}
            >
              {CANDIDATE_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha contratacion
            <input
              type="date"
              value={candidateForm.hiredAt}
              onChange={(event) => setCandidateForm((prev) => ({ ...prev, hiredAt: event.target.value }))}
            />
          </label>
          <button className="btn-primary" type="submit" disabled={pending}>
            Guardar candidato
          </button>
          <button className="btn-secondary" type="button" onClick={() => setCandidateDrawerOpen(false)}>
            Cancelar
          </button>
        </form>
      </FormDrawer>

      <Panel title="Vacantes activas">
        <InlineError message={error || contractsApi.error} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cargo</th>
                <th>Area</th>
                <th>Contrato</th>
                <th>Cupos</th>
                <th>Fecha objetivo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {vacancies.length === 0 ? (
                <tr className="table-empty-row">
                  <td colSpan={6}>
                    <EmptyState message="Aun no hay vacantes registradas." />
                  </td>
                </tr>
              ) : null}
              {vacancies.map((vacancy) => {
                const contract = contractsApi.items.find((item) => item.id === vacancy.contractId);
                return (
                  <tr key={vacancy.id}>
                    <td>{vacancy.title}</td>
                    <td>{vacancy.area}</td>
                    <td>{contract?.name || "Sin contrato"}</td>
                    <td>{vacancy.openings}</td>
                    <td>{formatDate(vacancy.targetDate)}</td>
                    <td>
                      <select
                        value={vacancy.status}
                        onChange={(event) =>
                          void api
                            .patch("/api/hr/recruiting", {
                              resource: "vacancy",
                              payload: { id: vacancy.id, status: event.target.value as VacancyStatus }
                            })
                            .then(() => load())
                            .catch((err) => setError(err instanceof Error ? err.message : "No se pudo actualizar vacante."))
                        }
                      >
                        {VACANCY_STATUSES.map((status) => (
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

      <Panel title="Pipeline por etapa (drag & drop)">
        <p>Puedes arrastrar cualquier tarjeta con mouse/touch para mover candidatos entre etapas.</p>
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="pipeline-board">
            {CANDIDATE_STAGES.map((stage) => {
              const stageCandidates = candidates.filter((candidate) => candidate.stage === stage);
              return (
                <StageDropZone stage={stage} count={stageCandidates.length} key={stage}>
                  <SortableContext items={stageCandidates.map((candidate) => candidate.id)} strategy={verticalListSortingStrategy}>
                    {stageCandidates.length === 0 ? <EmptyState message="Sin candidatos en esta etapa." /> : null}
                    {stageCandidates.map((candidate) => {
                      const vacancy = vacancies.find((item) => item.id === candidate.vacancyId);
                      return <SortableCandidateCard candidate={candidate} vacancy={vacancy} key={candidate.id} />;
                    })}
                  </SortableContext>
                </StageDropZone>
              );
            })}
          </div>
          <DragOverlay>
            {activeDragCandidate ? (
              <article className="candidate-card is-dragging">
                <strong>{activeDragCandidate.name}</strong>
                <p>{activeDragCandidate.source}</p>
                <p>{formatCurrency(activeDragCandidate.salary)}</p>
              </article>
            ) : null}
          </DragOverlay>
        </DndContext>
      </Panel>

      <Panel title="Candidatos">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Vacante</th>
                <th>Fuente</th>
                <th>Renta</th>
                <th>Etapa</th>
                <th>Contratado</th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 ? (
                <tr className="table-empty-row">
                  <td colSpan={6}>
                    <EmptyState message="Aun no hay candidatos en el proceso." />
                  </td>
                </tr>
              ) : null}
              {candidates.map((candidate) => {
                const vacancy = vacancies.find((item) => item.id === candidate.vacancyId);
                return (
                  <tr key={candidate.id}>
                    <td>{candidate.name}</td>
                    <td>{vacancy?.title || "Vacante no encontrada"}</td>
                    <td>{candidate.source}</td>
                    <td>{formatCurrency(candidate.salary)}</td>
                    <td>
                      <select
                        value={candidate.stage}
                        onChange={(event) =>
                          void api
                            .patch("/api/hr/recruiting", {
                              resource: "candidate",
                              payload: {
                                id: candidate.id,
                                stage: event.target.value as CandidateStage,
                                hiredAt:
                                  event.target.value === "hired" && !candidate.hiredAt
                                    ? new Date().toISOString().slice(0, 10)
                                    : candidate.hiredAt
                              }
                            })
                            .then(() => load())
                            .catch((err) => setError(err instanceof Error ? err.message : "No se pudo actualizar candidato."))
                        }
                      >
                        {CANDIDATE_STAGES.map((stage) => (
                          <option key={stage} value={stage}>
                            {stage}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{formatDate(candidate.hiredAt)}</td>
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
