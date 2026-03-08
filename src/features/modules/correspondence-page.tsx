"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  EmptyState,
  FormDrawer,
  InlineError,
  KpiGrid,
  ModuleActionBar,
  ModulePage,
  Panel,
  StatusBadge,
  Toast
} from "@/features/modules/module-ui";
import { useApiClient } from "@/lib/api/use-api-client";
import { firebaseStorage } from "@/lib/firebase/client";
import type {
  CorrespondenceDataSource,
  CorrespondenceJob,
  CorrespondenceSourceType,
  CorrespondenceTemplate
} from "@/types/domain";
import { formatDate } from "@/lib/format";

type ListResponse<T> = { data: T[] };
type UploadIntentResponse = {
  data: {
    uploadIntentId: string;
    uploadPath: string;
    expiresAt: string;
  };
};

function toneFromJobStatus(status: CorrespondenceJob["status"]): "good" | "warn" | "risk" {
  if (status === "completed") return "good";
  if (status === "processing" || status === "queued") return "warn";
  return "risk";
}

export function CorrespondencePage() {
  const api = useApiClient();
  const [templates, setTemplates] = useState<CorrespondenceTemplate[]>([]);
  const [dataSources, setDataSources] = useState<CorrespondenceDataSource[]>([]);
  const [jobs, setJobs] = useState<CorrespondenceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "success" | "error" } | null>(null);
  const [pendingDownloadJobId, setPendingDownloadJobId] = useState<string | null>(null);

  const [templateForm, setTemplateForm] = useState({
    name: "",
    delimiter: "angle" as CorrespondenceTemplate["delimiter"]
  });
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateUploading, setTemplateUploading] = useState(false);
  const [isTemplateDrawerOpen, setTemplateDrawerOpen] = useState(false);

  const [sourceForm, setSourceForm] = useState({
    name: "",
    sourceType: "csv" as CorrespondenceSourceType
  });
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUploading, setSourceUploading] = useState(false);
  const [isSourceDrawerOpen, setSourceDrawerOpen] = useState(false);

  const [jobForm, setJobForm] = useState({
    name: "",
    templateId: "",
    dataSourceId: ""
  });
  const [runningJob, setRunningJob] = useState(false);
  const [isJobDrawerOpen, setJobDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [templatesRes, dataSourcesRes, jobsRes] = await Promise.all([
        api.get<ListResponse<CorrespondenceTemplate>>("/api/correspondence/templates"),
        api.get<ListResponse<CorrespondenceDataSource>>("/api/correspondence/data-sources"),
        api.get<ListResponse<CorrespondenceJob>>("/api/correspondence/jobs")
      ]);
      setTemplates(templatesRes.data);
      setDataSources(dataSourcesRes.data);
      setJobs(jobsRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar correspondencia cruzada.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeTemplates = useMemo(
    () => templates.filter((template) => template.status === "active").length,
    [templates]
  );
  const activeDataSources = useMemo(
    () => dataSources.filter((source) => source.status === "active").length,
    [dataSources]
  );
  const completedJobs = useMemo(
    () => jobs.filter((job) => job.status === "completed").length,
    [jobs]
  );
  const failedJobs = useMemo(
    () => jobs.filter((job) => job.status === "failed").length,
    [jobs]
  );

  async function uploadTemplate(): Promise<boolean> {
    if (!templateFile) return false;
    setTemplateUploading(true);
    setError(null);

    try {
      if (!firebaseStorage) {
        throw new Error("Firebase Storage is not configured. Check NEXT_PUBLIC_FIREBASE_* env vars.");
      }

      const uploadIntent = await api.post<UploadIntentResponse>("/api/correspondence/templates/upload-intent", {
        fileName: templateFile.name,
        mimeType: templateFile.type || "application/octet-stream",
        sizeBytes: templateFile.size
      });

      await uploadBytes(ref(firebaseStorage, uploadIntent.data.uploadPath), templateFile);
      await api.post("/api/correspondence/templates", {
        name: templateForm.name,
        uploadIntentId: uploadIntent.data.uploadIntentId,
        fileName: templateFile.name,
        delimiter: templateForm.delimiter
      });

      setTemplateForm({ name: "", delimiter: "angle" });
      setTemplateFile(null);
      setToast({ message: "Plantilla creada.", tone: "success" });
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear plantilla.");
      setToast({ message: "No se pudo crear plantilla.", tone: "error" });
      return false;
    } finally {
      setTemplateUploading(false);
    }
  }

  async function uploadDataSource(): Promise<boolean> {
    if (!sourceFile) return false;
    setSourceUploading(true);
    setError(null);

    try {
      if (!firebaseStorage) {
        throw new Error("Firebase Storage is not configured. Check NEXT_PUBLIC_FIREBASE_* env vars.");
      }

      const uploadIntent = await api.post<UploadIntentResponse>("/api/correspondence/data-sources/upload-intent", {
        sourceType: sourceForm.sourceType,
        fileName: sourceFile.name,
        mimeType: sourceFile.type || "application/octet-stream",
        sizeBytes: sourceFile.size
      });

      await uploadBytes(ref(firebaseStorage, uploadIntent.data.uploadPath), sourceFile);
      await api.post("/api/correspondence/data-sources", {
        name: sourceForm.name,
        sourceType: sourceForm.sourceType,
        uploadIntentId: uploadIntent.data.uploadIntentId,
        fileName: sourceFile.name
      });

      setSourceForm({ name: "", sourceType: "csv" });
      setSourceFile(null);
      setToast({ message: "Fuente de datos creada.", tone: "success" });
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear fuente de datos.");
      setToast({ message: "No se pudo crear fuente de datos.", tone: "error" });
      return false;
    } finally {
      setSourceUploading(false);
    }
  }

  async function runJob(): Promise<boolean> {
    setRunningJob(true);
    setError(null);
    try {
      await api.post<{ data: CorrespondenceJob }>("/api/correspondence/jobs/run", {
        name: jobForm.name,
        templateId: jobForm.templateId,
        dataSourceId: jobForm.dataSourceId,
        outputFormats: ["docx"]
      });
      setJobForm({ name: "", templateId: "", dataSourceId: "" });
      setToast({ message: "Job ejecutado correctamente.", tone: "success" });
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo ejecutar job.");
      setToast({ message: "No se pudo ejecutar job.", tone: "error" });
      return false;
    } finally {
      setRunningJob(false);
    }
  }

  async function downloadJobResult(job: CorrespondenceJob) {
    if (!job.resultZipPath) {
      setToast({ message: "Este job no tiene ZIP disponible.", tone: "info" });
      return;
    }
    if (!firebaseStorage) {
      setToast({ message: "Firebase Storage no esta configurado.", tone: "error" });
      return;
    }

    setPendingDownloadJobId(job.id);
    try {
      const url = await getDownloadURL(ref(firebaseStorage, job.resultZipPath));
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${job.name || "correspondence"}-result.zip`;
      window.document.body.appendChild(anchor);
      anchor.click();
      window.document.body.removeChild(anchor);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "No se pudo descargar ZIP.", tone: "error" });
    } finally {
      setPendingDownloadJobId(null);
    }
  }

  return (
    <ModulePage
      title="Correspondencia Cruzada"
      description="Modulo independiente para merge de plantillas DOCX con fuentes CSV/XLSX/JSON."
    >
      <Toast message={toast?.message || null} tone={toast?.tone || "info"} />
      <KpiGrid
        items={[
          { label: "Plantillas activas", value: activeTemplates },
          { label: "Fuentes activas", value: activeDataSources },
          { label: "Jobs completados", value: completedJobs },
          { label: "Jobs fallidos", value: failedJobs }
        ]}
      />
      <InlineError message={error} />

      <ModuleActionBar>
        <button className="btn-secondary" type="button" onClick={() => setTemplateDrawerOpen(true)}>
          Agregar plantilla
        </button>
        <button className="btn-secondary" type="button" onClick={() => setSourceDrawerOpen(true)}>
          Agregar fuente
        </button>
        <button className="btn-primary" type="button" onClick={() => setJobDrawerOpen(true)}>
          Ejecutar job
        </button>
      </ModuleActionBar>

      <Panel title="Plantillas DOCX">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Archivo</th>
                <th>Llaves</th>
                <th>Estado</th>
                <th>Creado</th>
              </tr>
            </thead>
            <tbody>
              {!loading && templates.length === 0 ? (
                <tr className="table-empty-row">
                  <td colSpan={5}>
                    <EmptyState message="No hay plantillas cargadas." />
                  </td>
                </tr>
              ) : null}
              {templates.map((template) => (
                <tr key={template.id}>
                  <td>{template.name}</td>
                  <td>{template.fileName}</td>
                  <td>{template.keys.length ? template.keys.join(", ") : "-"}</td>
                  <td>{template.status}</td>
                  <td>{formatDate(template.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Fuentes de datos">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Filas</th>
                <th>Columnas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {!loading && dataSources.length === 0 ? (
                <tr className="table-empty-row">
                  <td colSpan={5}>
                    <EmptyState message="No hay fuentes de datos cargadas." />
                  </td>
                </tr>
              ) : null}
              {dataSources.map((source) => (
                <tr key={source.id}>
                  <td>{source.name}</td>
                  <td>{source.sourceType}</td>
                  <td>{source.rowsCount}</td>
                  <td>{source.columns.join(", ") || "-"}</td>
                  <td>{source.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Ejecuciones">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Template</th>
                <th>Fuente</th>
                <th>Estado</th>
                <th>Docs OK</th>
                <th>Docs Fallidos</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!loading && jobs.length === 0 ? (
                <tr className="table-empty-row">
                  <td colSpan={7}>
                    <EmptyState message="Aun no hay ejecuciones." />
                  </td>
                </tr>
              ) : null}
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.name}</td>
                  <td>{templates.find((template) => template.id === job.templateId)?.name || job.templateId}</td>
                  <td>{dataSources.find((source) => source.id === job.dataSourceId)?.name || job.dataSourceId}</td>
                  <td>
                    <StatusBadge tone={toneFromJobStatus(job.status)}>{job.status}</StatusBadge>
                  </td>
                  <td>{job.processedRows}</td>
                  <td>{job.failedRows}</td>
                  <td>
                    <button
                      className="btn-secondary"
                      type="button"
                      disabled={job.status !== "completed" || pendingDownloadJobId === job.id}
                      onClick={() => void downloadJobResult(job)}
                    >
                      Descargar ZIP
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <FormDrawer
        isOpen={isTemplateDrawerOpen}
        title="Agregar plantilla DOCX"
        description="Carga una plantilla con llaves para merge."
        onClose={() => setTemplateDrawerOpen(false)}
      >
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void uploadTemplate().then((ok) => {
              if (ok) {
                setTemplateDrawerOpen(false);
              }
            });
          }}
        >
          <label>
            Nombre
            <input value={templateForm.name} onChange={(event) => setTemplateForm((prev) => ({ ...prev, name: event.target.value }))} required />
          </label>
          <label>
            Delimitador
            <select
              value={templateForm.delimiter}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, delimiter: event.target.value as CorrespondenceTemplate["delimiter"] }))}
            >
              <option value="angle">angle (&#171;nombre&#187;)</option>
              <option value="double_angle">double_angle (&lt;&lt;nombre&gt;&gt;)</option>
              <option value="curly">curly (&#123;&#123;nombre&#125;&#125;)</option>
              <option value="bracket">bracket ([nombre])</option>
              <option value="question">question (?nombre?)</option>
            </select>
          </label>
          <label>
            Archivo DOCX
            <input type="file" accept=".docx" onChange={(event) => setTemplateFile(event.target.files?.[0] || null)} required />
          </label>
          <button className="btn-primary" type="submit" disabled={templateUploading || !templateFile}>
            {templateUploading ? "Subiendo..." : "Guardar plantilla"}
          </button>
          <button className="btn-secondary" type="button" onClick={() => setTemplateDrawerOpen(false)}>
            Cancelar
          </button>
        </form>
      </FormDrawer>

      <FormDrawer
        isOpen={isSourceDrawerOpen}
        title="Agregar fuente de datos"
        description="Carga una fuente CSV/XLSX/JSON para ejecutar merge."
        onClose={() => setSourceDrawerOpen(false)}
      >
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void uploadDataSource().then((ok) => {
              if (ok) {
                setSourceDrawerOpen(false);
              }
            });
          }}
        >
          <label>
            Nombre
            <input value={sourceForm.name} onChange={(event) => setSourceForm((prev) => ({ ...prev, name: event.target.value }))} required />
          </label>
          <label>
            Tipo
            <select
              value={sourceForm.sourceType}
              onChange={(event) => setSourceForm((prev) => ({ ...prev, sourceType: event.target.value as CorrespondenceSourceType }))}
            >
              <option value="csv">csv</option>
              <option value="xlsx">xlsx</option>
              <option value="json">json</option>
            </select>
          </label>
          <label>
            Archivo
            <input
              type="file"
              accept={sourceForm.sourceType === "csv" ? ".csv" : sourceForm.sourceType === "xlsx" ? ".xlsx" : ".json"}
              onChange={(event) => setSourceFile(event.target.files?.[0] || null)}
              required
            />
          </label>
          <button className="btn-primary" type="submit" disabled={sourceUploading || !sourceFile}>
            {sourceUploading ? "Subiendo..." : "Guardar fuente"}
          </button>
          <button className="btn-secondary" type="button" onClick={() => setSourceDrawerOpen(false)}>
            Cancelar
          </button>
        </form>
      </FormDrawer>

      <FormDrawer
        isOpen={isJobDrawerOpen}
        title="Ejecutar correspondencia cruzada"
        description="Selecciona plantilla y fuente para generar documentos DOCX."
        onClose={() => setJobDrawerOpen(false)}
      >
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void runJob().then((ok) => {
              if (ok) {
                setJobDrawerOpen(false);
              }
            });
          }}
        >
          <label>
            Nombre del job
            <input value={jobForm.name} onChange={(event) => setJobForm((prev) => ({ ...prev, name: event.target.value }))} required />
          </label>
          <label>
            Plantilla
            <select
              value={jobForm.templateId}
              onChange={(event) => setJobForm((prev) => ({ ...prev, templateId: event.target.value }))}
              required
            >
              <option value="">Selecciona</option>
              {templates.filter((template) => template.status === "active").map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fuente
            <select
              value={jobForm.dataSourceId}
              onChange={(event) => setJobForm((prev) => ({ ...prev, dataSourceId: event.target.value }))}
              required
            >
              <option value="">Selecciona</option>
              {dataSources.filter((source) => source.status === "active").map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name} ({source.rowsCount} filas)
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" type="submit" disabled={runningJob}>
            {runningJob ? "Ejecutando..." : "Ejecutar"}
          </button>
          <button className="btn-secondary" type="button" onClick={() => setJobDrawerOpen(false)}>
            Cancelar
          </button>
        </form>
      </FormDrawer>
    </ModulePage>
  );
}
