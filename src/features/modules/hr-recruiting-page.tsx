"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { InlineError, KpiGrid, ModulePage, Panel } from "@/features/modules/module-ui";
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

export function HrRecruitingPage() {
  const api = useApiClient();
  const contractsApi = useCrudModule<Contract>("/api/contracts");

  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const submitVacancy = useCallback(async () => {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear vacante.");
      setPending(false);
    }
  }, [api, load, vacancyForm]);

  const submitCandidate = useCallback(async () => {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear candidato.");
      setPending(false);
    }
  }, [api, candidateForm, load]);

  return (
    <ModulePage
      title="RRHH - Reclutamiento y seleccion"
      description="Gestion de vacantes por contrato y seguimiento de candidatos por etapa."
    >
      <KpiGrid
        items={[
          { label: "Vacantes", value: vacancies.length },
          { label: "Vacantes abiertas", value: vacancies.filter((item) => item.status === "open").length },
          { label: "Candidatos", value: candidates.length },
          { label: "Candidatos activos", value: activeCandidates }
        ]}
      />

      <Panel title="Nueva vacante">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void submitVacancy();
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
        </form>
      </Panel>

      <Panel title="Nuevo candidato">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCandidate();
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
        </form>
      </Panel>

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
