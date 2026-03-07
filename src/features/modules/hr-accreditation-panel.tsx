"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useApiClient } from "@/lib/api/use-api-client";
import { firebaseStorage } from "@/lib/firebase/client";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { formatDate } from "@/lib/format";
import {
  EmptyState,
  FormDrawer,
  InlineError,
  ModuleActionBar,
  Panel,
  SkeletonRows,
  StatusBadge,
  Toast
} from "@/features/modules/module-ui";
import { useCrudModule } from "@/features/modules/use-crud-module";
import type {
  AccreditationRequirementResult,
  AccreditationScope,
  AccreditationTemplate,
  Contract,
  PersonContractAssignment,
  PersonDocument,
  PersonRecord
} from "@/types/domain";

type MatrixResponse = {
  data: {
    person: PersonRecord;
    contract: Contract;
    asOf: string;
    isAssignedToContract: boolean;
    summary: {
      total: number;
      pending: number;
      expired: number;
      compliant: number;
      reused: number;
    };
    requirements: AccreditationRequirementResult[];
  };
};

type AssignmentsResponse = { data: PersonContractAssignment[] };
type TemplatesResponse = { data: AccreditationTemplate[] };

type TemplateDraft = {
  name: string;
  scope: AccreditationScope;
  clientName: string;
  contractId: string;
  required: boolean;
  validityDays: string;
  enabled: boolean;
  sortOrder: string;
};

function toneFromRequirementStatus(status: AccreditationRequirementResult["status"]): "good" | "warn" | "risk" {
  if (status === "expired") return "risk";
  if (status === "pending") return "warn";
  return "good";
}

function normalizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildTemplateDraft(template: AccreditationTemplate): TemplateDraft {
  return {
    name: template.name,
    scope: template.scope,
    clientName: template.clientName || "",
    contractId: template.contractId || "",
    required: template.required,
    validityDays: template.validityDays ? String(template.validityDays) : "",
    enabled: template.enabled,
    sortOrder: String(template.sortOrder)
  };
}

export function HrAccreditationPanel({
  fixedPersonId
}: {
  fixedPersonId?: string;
}) {
  const api = useApiClient();
  const peopleApi = useCrudModule<PersonRecord>("/api/hr/people");
  const contractsApi = useCrudModule<Contract>("/api/contracts");
  const documentsApi = useCrudModule<PersonDocument>("/api/hr/documents");

  const [selectedPersonId, setSelectedPersonId] = useState<string>(fixedPersonId || "");
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [assignmentForm, setAssignmentForm] = useState({
    contractId: "",
    startDate: todayIsoDate(),
    endDate: ""
  });
  const [newTemplateForm, setNewTemplateForm] = useState({
    code: "",
    name: "",
    scope: "global" as AccreditationScope,
    clientName: "",
    contractId: "",
    required: true,
    validityDays: "",
    enabled: true,
    sortOrder: "100"
  });
  const [assignments, setAssignments] = useState<PersonContractAssignment[]>([]);
  const [templates, setTemplates] = useState<AccreditationTemplate[]>([]);
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, TemplateDraft>>({});
  const [matrix, setMatrix] = useState<MatrixResponse["data"] | null>(null);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "success" | "error" } | null>(null);
  const [pendingAssignmentId, setPendingAssignmentId] = useState<string | null>(null);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [pendingEvidenceDocumentId, setPendingEvidenceDocumentId] = useState<string | null>(null);
  const [isAssignmentDrawerOpen, setAssignmentDrawerOpen] = useState(false);
  const [isTemplateDrawerOpen, setTemplateDrawerOpen] = useState(false);
  const [isEvidenceDrawerOpen, setEvidenceDrawerOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<AccreditationTemplate | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadExpiryDate, setUploadExpiryDate] = useState("");
  const [uploading, setUploading] = useState(false);

  const selectedPerson = useMemo(
    () => peopleApi.items.find((person) => person.id === selectedPersonId) || null,
    [peopleApi.items, selectedPersonId]
  );

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.status === "active"),
    [assignments]
  );

  const selectableContractIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedPerson?.contractId) {
      ids.add(selectedPerson.contractId);
    }
    for (const assignment of activeAssignments) {
      ids.add(assignment.contractId);
    }
    return Array.from(ids);
  }, [activeAssignments, selectedPerson?.contractId]);

  const contractOptions = useMemo(
    () => contractsApi.items.filter((contract) => selectableContractIds.includes(contract.id)),
    [contractsApi.items, selectableContractIds]
  );

  const personDocuments = useMemo(
    () => documentsApi.items.filter((document) => document.personId === selectedPersonId),
    [documentsApi.items, selectedPersonId]
  );

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const response = await api.get<TemplatesResponse>("/api/hr/accreditation/templates?includeDisabled=true");
      setTemplates(response.data);
      setTemplateDrafts(
        Object.fromEntries(response.data.map((template) => [template.id, buildTemplateDraft(template)]))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar plantillas.");
    } finally {
      setLoadingTemplates(false);
    }
  }, [api]);

  const loadAssignments = useCallback(
    async (personId: string) => {
      setLoadingAssignments(true);
      try {
        const response = await api.get<AssignmentsResponse>(`/api/hr/accreditation/assignments?personId=${personId}`);
        setAssignments(response.data);

        const validIds = new Set<string>();
        if (selectedPerson?.contractId) {
          validIds.add(selectedPerson.contractId);
        }
        for (const assignment of response.data) {
          if (assignment.status === "active") {
            validIds.add(assignment.contractId);
          }
        }
        setSelectedContractId((current) => {
          if (current && validIds.has(current)) {
            return current;
          }
          const firstFromAssignment = response.data.find((assignment) => assignment.status === "active");
          return firstFromAssignment?.contractId || selectedPerson?.contractId || "";
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron cargar asignaciones.");
      } finally {
        setLoadingAssignments(false);
      }
    },
    [api, selectedPerson?.contractId]
  );

  const loadMatrix = useCallback(
    async (personId: string, contractId: string) => {
      setLoadingMatrix(true);
      try {
        const response = await api.get<MatrixResponse>(
          `/api/hr/accreditation/matrix?personId=${personId}&contractId=${contractId}`
        );
        setMatrix(response.data);
      } catch (err) {
        setMatrix(null);
        setError(err instanceof Error ? err.message : "No se pudo cargar la matriz de acreditacion.");
      } finally {
        setLoadingMatrix(false);
      }
    },
    [api]
  );

  useEffect(() => {
    if (fixedPersonId) {
      setSelectedPersonId(fixedPersonId);
      return;
    }
    if (!selectedPersonId && peopleApi.items.length > 0) {
      setSelectedPersonId(peopleApi.items[0].id);
    }
  }, [fixedPersonId, peopleApi.items, selectedPersonId]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (!selectedPersonId) return;
    void loadAssignments(selectedPersonId);
  }, [loadAssignments, selectedPersonId]);

  useEffect(() => {
    if (!selectedPersonId || !selectedContractId) return;
    void loadMatrix(selectedPersonId, selectedContractId);
  }, [loadMatrix, selectedContractId, selectedPersonId]);

  const createAssignment = useCallback(async (): Promise<boolean> => {
    if (!selectedPersonId || !assignmentForm.contractId) return false;
    setError(null);
    try {
      await api.post("/api/hr/accreditation/assignments", {
        personId: selectedPersonId,
        contractId: assignmentForm.contractId,
        startDate: assignmentForm.startDate,
        endDate: assignmentForm.endDate || null,
        status: "active"
      });
      setToast({ message: "Asignacion creada.", tone: "success" });
      setAssignmentForm((current) => ({
        ...current,
        contractId: "",
        startDate: todayIsoDate(),
        endDate: ""
      }));
      await loadAssignments(selectedPersonId);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear asignacion.");
      setToast({ message: "No se pudo crear asignacion.", tone: "error" });
      return false;
    }
  }, [api, assignmentForm.contractId, assignmentForm.endDate, assignmentForm.startDate, loadAssignments, selectedPersonId]);

  const closeAssignment = useCallback(
    async (assignmentId: string) => {
      setPendingAssignmentId(assignmentId);
      setError(null);
      try {
        await api.patch("/api/hr/accreditation/assignments", {
          id: assignmentId,
          status: "inactive",
          endDate: todayIsoDate()
        });
        setToast({ message: "Asignacion cerrada.", tone: "success" });
        if (selectedPersonId) {
          await loadAssignments(selectedPersonId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cerrar asignacion.");
        setToast({ message: "No se pudo cerrar asignacion.", tone: "error" });
      } finally {
        setPendingAssignmentId(null);
      }
    },
    [api, loadAssignments, selectedPersonId]
  );

  const createTemplate = useCallback(async (): Promise<boolean> => {
    setError(null);
    try {
      await api.post("/api/hr/accreditation/templates", {
        code: newTemplateForm.code.trim(),
        name: newTemplateForm.name.trim(),
        scope: newTemplateForm.scope,
        clientName: newTemplateForm.clientName.trim() || null,
        contractId: newTemplateForm.contractId || null,
        required: newTemplateForm.required,
        validityDays: newTemplateForm.validityDays ? Number(newTemplateForm.validityDays) : null,
        enabled: newTemplateForm.enabled,
        sortOrder: Number(newTemplateForm.sortOrder || "100")
      });
      setToast({ message: "Plantilla creada.", tone: "success" });
      setNewTemplateForm({
        code: "",
        name: "",
        scope: "global",
        clientName: "",
        contractId: "",
        required: true,
        validityDays: "",
        enabled: true,
        sortOrder: "100"
      });
      await loadTemplates();
      if (selectedPersonId && selectedContractId) {
        await loadMatrix(selectedPersonId, selectedContractId);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear plantilla.");
      setToast({ message: "No se pudo crear plantilla.", tone: "error" });
      return false;
    }
  }, [api, loadMatrix, loadTemplates, newTemplateForm.clientName, newTemplateForm.code, newTemplateForm.contractId, newTemplateForm.enabled, newTemplateForm.name, newTemplateForm.required, newTemplateForm.scope, newTemplateForm.sortOrder, newTemplateForm.validityDays, selectedContractId, selectedPersonId]);

  const saveTemplate = useCallback(
    async (templateId: string) => {
      const draft = templateDrafts[templateId];
      if (!draft) return;
      setPendingTemplateId(templateId);
      setError(null);
      try {
        await api.patch("/api/hr/accreditation/templates", {
          id: templateId,
          name: draft.name.trim(),
          scope: draft.scope,
          clientName: draft.clientName.trim() || null,
          contractId: draft.contractId || null,
          required: draft.required,
          validityDays: draft.validityDays ? Number(draft.validityDays) : null,
          enabled: draft.enabled,
          sortOrder: Number(draft.sortOrder || "100")
        });
        setToast({ message: "Plantilla actualizada.", tone: "success" });
        await loadTemplates();
        if (selectedPersonId && selectedContractId) {
          await loadMatrix(selectedPersonId, selectedContractId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo actualizar plantilla.");
        setToast({ message: "No se pudo actualizar plantilla.", tone: "error" });
      } finally {
        setPendingTemplateId(null);
      }
    },
    [api, loadMatrix, loadTemplates, selectedContractId, selectedPersonId, templateDrafts]
  );

  const handleDocumentAccess = useCallback(
    async (document: PersonDocument, mode: "view" | "download") => {
      if (!document.filePath) {
        setToast({ message: "El documento no tiene ruta registrada.", tone: "error" });
        return;
      }
      if (!firebaseStorage) {
        setToast({ message: "Firebase Storage no esta configurado.", tone: "error" });
        return;
      }

      setPendingEvidenceDocumentId(document.id);
      const previewWindow = mode === "view" ? window.open("", "_blank", "noopener,noreferrer") : null;
      try {
        const url = await getDownloadURL(ref(firebaseStorage, document.filePath));
        if (mode === "view") {
          if (previewWindow) {
            previewWindow.location.href = url;
          } else {
            window.open(url, "_blank", "noopener,noreferrer");
          }
        } else {
          const anchor = window.document.createElement("a");
          anchor.href = url;
          anchor.download = document.fileName || "documento";
          window.document.body.appendChild(anchor);
          anchor.click();
          window.document.body.removeChild(anchor);
        }
      } catch (err) {
        if (previewWindow) {
          previewWindow.close();
        }
        setToast({ message: err instanceof Error ? err.message : "No se pudo abrir el documento.", tone: "error" });
      } finally {
        setPendingEvidenceDocumentId(null);
      }
    },
    []
  );

  const uploadEvidence = useCallback(async (): Promise<boolean> => {
    if (!selectedPersonId || !selectedContractId || !uploadTarget || !uploadFile) return false;

    setUploading(true);
    setUploadError(null);
    try {
      if (!firebaseStorage) {
        throw new Error("Firebase Storage is not configured.");
      }

      const fileName = uploadFile.name;
      const filePath = `tenants/${DEFAULT_TENANT_ID}/people/${selectedPersonId}/documents/${Date.now()}-${normalizeFileName(fileName)}`;
      await uploadBytes(ref(firebaseStorage, filePath), uploadFile);

      const scope = uploadTarget.scope;
      const payload = {
        personId: selectedPersonId,
        docType: uploadTarget.name,
        fileName,
        filePath,
        templateCode: uploadTarget.code,
        scope,
        clientName: scope === "client" ? uploadTarget.clientName : null,
        contractId: scope === "contract" ? selectedContractId : null,
        validFrom: todayIsoDate(),
        reusable: true,
        expiryDate: uploadExpiryDate || null
      };

      await api.post("/api/hr/documents", payload);
      setToast({ message: "Evidencia subida y vinculada.", tone: "success" });
      setUploadTarget(null);
      setUploadFile(null);
      setUploadExpiryDate("");
      await documentsApi.reload();
      await loadMatrix(selectedPersonId, selectedContractId);
      return true;
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "No se pudo subir evidencia.");
      setToast({ message: "No se pudo subir evidencia.", tone: "error" });
      return false;
    } finally {
      setUploading(false);
    }
  }, [api, documentsApi, loadMatrix, selectedContractId, selectedPersonId, uploadExpiryDate, uploadFile, uploadTarget]);

  return (
    <>
      <Toast message={toast?.message || null} tone={toast?.tone || "info"} />
      <Panel title="Acreditacion por contrato y cliente">
        <p>Gestiona asignaciones persona-contrato, plantillas y cumplimiento documental reutilizable.</p>
      </Panel>

      <Panel title="Contexto de evaluacion">
        <InlineError message={error || uploadError || peopleApi.error || contractsApi.error || documentsApi.error} />
        <div className="toolbar">
          {!fixedPersonId ? (
            <label>
              Persona
              <select value={selectedPersonId} onChange={(event) => setSelectedPersonId(event.target.value)}>
                <option value="">Selecciona persona</option>
                {peopleApi.items.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName} ({person.idNumber})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Contrato
            <select value={selectedContractId} onChange={(event) => setSelectedContractId(event.target.value)}>
              <option value="">Selecciona contrato</option>
              {contractOptions.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn-secondary"
            type="button"
            onClick={() => {
              if (selectedPersonId) {
                void loadAssignments(selectedPersonId);
              }
              if (selectedPersonId && selectedContractId) {
                void loadMatrix(selectedPersonId, selectedContractId);
              }
              void loadTemplates();
              void documentsApi.reload();
            }}
          >
            Refrescar
          </button>
        </div>
      </Panel>

      <Panel title="Asignaciones persona-contrato">
        {!selectedPersonId ? <EmptyState message="Selecciona una persona para gestionar asignaciones." /> : null}
        {selectedPersonId ? (
          <>
            <ModuleActionBar>
              <button className="btn-primary" type="button" onClick={() => setAssignmentDrawerOpen(true)}>
                Agregar asignacion
              </button>
            </ModuleActionBar>

            {loadingAssignments ? <SkeletonRows rows={3} /> : null}

            {!loadingAssignments ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Contrato</th>
                      <th>Inicio</th>
                      <th>Fin</th>
                      <th>Estado</th>
                      <th>Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.length === 0 ? (
                      <tr className="table-empty-row">
                        <td colSpan={5}>
                          <EmptyState message="Esta persona aun no tiene asignaciones registradas." />
                        </td>
                      </tr>
                    ) : null}
                    {assignments.map((assignment) => {
                      const contract = contractsApi.items.find((item) => item.id === assignment.contractId);
                      return (
                        <tr key={assignment.id}>
                          <td>{contract?.name || assignment.contractId}</td>
                          <td>{formatDate(assignment.startDate)}</td>
                          <td>{formatDate(assignment.endDate)}</td>
                          <td>{assignment.status}</td>
                          <td>
                            <button
                              className="btn-secondary"
                              type="button"
                              disabled={assignment.status !== "active" || pendingAssignmentId === assignment.id}
                              onClick={() => void closeAssignment(assignment.id)}
                            >
                              Cerrar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}
      </Panel>

      <Panel title="Matriz de cumplimiento">
        {!selectedPersonId || !selectedContractId ? (
          <EmptyState message="Selecciona persona y contrato para evaluar la matriz de acreditacion." />
        ) : null}
        {loadingMatrix ? <SkeletonRows rows={5} /> : null}

        {!loadingMatrix && matrix ? (
          <>
            <div className="detail-grid">
              <div className="detail-item">
                <strong>Total requisitos</strong>
                <p>{matrix.summary.total}</p>
              </div>
              <div className="detail-item">
                <strong>Compliant</strong>
                <p>{matrix.summary.compliant}</p>
              </div>
              <div className="detail-item">
                <strong>Reused</strong>
                <p>{matrix.summary.reused}</p>
              </div>
              <div className="detail-item">
                <strong>Pending / Expired</strong>
                <p>
                  {matrix.summary.pending} / {matrix.summary.expired}
                </p>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Requisito</th>
                    <th>Scope</th>
                    <th>Estado</th>
                    <th>Evidencia</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.requirements.length === 0 ? (
                    <tr className="table-empty-row">
                      <td colSpan={5}>
                        <EmptyState message="No hay plantillas aplicables para este contrato." />
                      </td>
                    </tr>
                  ) : null}
                  {matrix.requirements.map((requirement) => {
                    const evidence = requirement.evidenceDocumentId
                      ? personDocuments.find((document) => document.id === requirement.evidenceDocumentId) || null
                      : null;
                    const busy = evidence ? pendingEvidenceDocumentId === evidence.id : false;

                    return (
                      <tr key={`${requirement.template.id}-${requirement.template.code}`}>
                        <td>
                          {requirement.template.name}
                          <br />
                          <small>{requirement.template.code}</small>
                        </td>
                        <td>{requirement.template.scope}</td>
                        <td>
                          <StatusBadge tone={toneFromRequirementStatus(requirement.status)}>{requirement.status}</StatusBadge>
                        </td>
                        <td>
                          {requirement.evidenceFileName ? (
                            <div>
                              <strong>{requirement.evidenceFileName}</strong>
                              <p>
                                {requirement.evidenceScope || "global"} | vence {formatDate(requirement.evidenceExpiryDate)}
                              </p>
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          <div className="toolbar">
                            <button
                              className="btn-secondary"
                              type="button"
                              onClick={() => {
                                setUploadTarget(requirement.template);
                                setUploadFile(null);
                                setUploadExpiryDate("");
                                setEvidenceDrawerOpen(true);
                              }}
                            >
                              Subir evidencia
                            </button>
                            <button
                              className="btn-secondary"
                              type="button"
                              disabled={!evidence || busy}
                              onClick={() => evidence && void handleDocumentAccess(evidence, "view")}
                            >
                              Ver
                            </button>
                            <button
                              className="btn-secondary"
                              type="button"
                              disabled={!evidence || busy}
                              onClick={() => evidence && void handleDocumentAccess(evidence, "download")}
                            >
                              Descargar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </Panel>

      <Panel title="Plantillas de acreditacion (CRUD basico)">
        <ModuleActionBar>
          <button className="btn-primary" type="button" onClick={() => setTemplateDrawerOpen(true)}>
            Agregar plantilla
          </button>
        </ModuleActionBar>

        {loadingTemplates ? <SkeletonRows rows={4} /> : null}

        {!loadingTemplates ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Nombre</th>
                  <th>Scope</th>
                  <th>Cliente/Contrato</th>
                  <th>Req</th>
                  <th>Habilitada</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 ? (
                  <tr className="table-empty-row">
                    <td colSpan={7}>
                      <EmptyState message="No hay plantillas registradas." />
                    </td>
                  </tr>
                ) : null}
                {templates.map((template) => {
                  const draft = templateDrafts[template.id] || buildTemplateDraft(template);
                  return (
                    <tr key={template.id}>
                      <td>{template.code}</td>
                      <td>
                        <input
                          value={draft.name}
                          onChange={(event) =>
                            setTemplateDrafts((current) => ({
                              ...current,
                              [template.id]: {
                                ...draft,
                                name: event.target.value
                              }
                            }))
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={draft.scope}
                          onChange={(event) =>
                            setTemplateDrafts((current) => ({
                              ...current,
                              [template.id]: {
                                ...draft,
                                scope: event.target.value as AccreditationScope
                              }
                            }))
                          }
                        >
                          <option value="global">global</option>
                          <option value="client">client</option>
                          <option value="contract">contract</option>
                        </select>
                      </td>
                      <td>
                        <input
                          value={draft.scope === "contract" ? draft.contractId : draft.clientName}
                          onChange={(event) =>
                            setTemplateDrafts((current) => ({
                              ...current,
                              [template.id]: {
                                ...draft,
                                clientName: draft.scope === "client" ? event.target.value : draft.clientName,
                                contractId: draft.scope === "contract" ? event.target.value : draft.contractId
                              }
                            }))
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={draft.required ? "true" : "false"}
                          onChange={(event) =>
                            setTemplateDrafts((current) => ({
                              ...current,
                              [template.id]: {
                                ...draft,
                                required: event.target.value === "true"
                              }
                            }))
                          }
                        >
                          <option value="true">Si</option>
                          <option value="false">No</option>
                        </select>
                      </td>
                      <td>
                        <select
                          value={draft.enabled ? "true" : "false"}
                          onChange={(event) =>
                            setTemplateDrafts((current) => ({
                              ...current,
                              [template.id]: {
                                ...draft,
                                enabled: event.target.value === "true"
                              }
                            }))
                          }
                        >
                          <option value="true">Si</option>
                          <option value="false">No</option>
                        </select>
                      </td>
                      <td>
                        <button
                          className="btn-secondary"
                          type="button"
                          disabled={pendingTemplateId === template.id}
                          onClick={() => void saveTemplate(template.id)}
                        >
                          Guardar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      <FormDrawer
        isOpen={isAssignmentDrawerOpen}
        title="Agregar asignacion persona-contrato"
        description="Permite multi-contrato con fechas de vigencia."
        onClose={() => setAssignmentDrawerOpen(false)}
      >
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void createAssignment().then((ok) => {
              if (ok) {
                setAssignmentDrawerOpen(false);
              }
            });
          }}
        >
          <label>
            Contrato
            <select
              value={assignmentForm.contractId}
              onChange={(event) =>
                setAssignmentForm((current) => ({
                  ...current,
                  contractId: event.target.value
                }))
              }
              required
            >
              <option value="">Selecciona contrato</option>
              {contractsApi.items.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Inicio
            <input
              type="date"
              value={assignmentForm.startDate}
              onChange={(event) =>
                setAssignmentForm((current) => ({
                  ...current,
                  startDate: event.target.value
                }))
              }
              required
            />
          </label>
          <label>
            Fin
            <input
              type="date"
              value={assignmentForm.endDate}
              onChange={(event) =>
                setAssignmentForm((current) => ({
                  ...current,
                  endDate: event.target.value
                }))
              }
            />
          </label>
          <button className="btn-primary" type="submit" disabled={!selectedPersonId}>
            Guardar asignacion
          </button>
          <button className="btn-secondary" type="button" onClick={() => setAssignmentDrawerOpen(false)}>
            Cancelar
          </button>
        </form>
      </FormDrawer>

      <FormDrawer
        isOpen={isTemplateDrawerOpen}
        title="Agregar plantilla de acreditacion"
        description="Define requisitos globales, por cliente o por contrato."
        onClose={() => setTemplateDrawerOpen(false)}
      >
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void createTemplate().then((ok) => {
              if (ok) {
                setTemplateDrawerOpen(false);
              }
            });
          }}
        >
          <label>
            Codigo
            <input
              value={newTemplateForm.code}
              onChange={(event) => setNewTemplateForm((current) => ({ ...current, code: event.target.value }))}
              required
            />
          </label>
          <label>
            Nombre
            <input
              value={newTemplateForm.name}
              onChange={(event) => setNewTemplateForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </label>
          <label>
            Scope
            <select
              value={newTemplateForm.scope}
              onChange={(event) =>
                setNewTemplateForm((current) => ({
                  ...current,
                  scope: event.target.value as AccreditationScope
                }))
              }
            >
              <option value="global">global</option>
              <option value="client">client</option>
              <option value="contract">contract</option>
            </select>
          </label>
          <label>
            Cliente
            <input
              value={newTemplateForm.clientName}
              onChange={(event) => setNewTemplateForm((current) => ({ ...current, clientName: event.target.value }))}
              disabled={newTemplateForm.scope === "global"}
            />
          </label>
          <label>
            Contrato
            <select
              value={newTemplateForm.contractId}
              onChange={(event) => setNewTemplateForm((current) => ({ ...current, contractId: event.target.value }))}
              disabled={newTemplateForm.scope !== "contract"}
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
            Vigencia dias
            <input
              type="number"
              min={1}
              value={newTemplateForm.validityDays}
              onChange={(event) => setNewTemplateForm((current) => ({ ...current, validityDays: event.target.value }))}
            />
          </label>
          <label>
            Orden
            <input
              type="number"
              min={0}
              value={newTemplateForm.sortOrder}
              onChange={(event) => setNewTemplateForm((current) => ({ ...current, sortOrder: event.target.value }))}
            />
          </label>
          <label>
            Requerido
            <select
              value={newTemplateForm.required ? "true" : "false"}
              onChange={(event) =>
                setNewTemplateForm((current) => ({
                  ...current,
                  required: event.target.value === "true"
                }))
              }
            >
              <option value="true">Si</option>
              <option value="false">No</option>
            </select>
          </label>
          <button className="btn-primary" type="submit">
            Guardar plantilla
          </button>
          <button className="btn-secondary" type="button" onClick={() => setTemplateDrawerOpen(false)}>
            Cancelar
          </button>
        </form>
      </FormDrawer>

      <FormDrawer
        isOpen={isEvidenceDrawerOpen}
        title="Cargar evidencia de acreditacion"
        description="Adjunta el documento para el requisito seleccionado."
        onClose={() => {
          setEvidenceDrawerOpen(false);
          setUploadTarget(null);
          setUploadFile(null);
          setUploadExpiryDate("");
        }}
      >
        {!uploadTarget ? <EmptyState message="Selecciona 'Subir evidencia' desde la matriz." /> : null}
        {uploadTarget ? (
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void uploadEvidence().then((ok) => {
                if (ok) {
                  setEvidenceDrawerOpen(false);
                }
              });
            }}
          >
            <label>
              Requisito
              <input value={`${uploadTarget.name} (${uploadTarget.code})`} readOnly />
            </label>
            <label>
              Scope
              <input value={uploadTarget.scope} readOnly />
            </label>
            <label>
              Vencimiento (opcional)
              <input
                type="date"
                value={uploadExpiryDate}
                onChange={(event) => setUploadExpiryDate(event.target.value)}
              />
            </label>
            <label>
              Archivo
              <input type="file" required onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
            </label>
            <button className="btn-primary" type="submit" disabled={!uploadFile || uploading}>
              {uploading ? "Subiendo..." : "Guardar evidencia"}
            </button>
            <button className="btn-secondary" type="button" onClick={() => setEvidenceDrawerOpen(false)}>
              Cancelar
            </button>
          </form>
        ) : null}
      </FormDrawer>
    </>
  );
}
