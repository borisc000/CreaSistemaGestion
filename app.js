const STORAGE_KEY = "rs_mvp_data_v1";

const STAGES = [
  { id: "intake", label: "Ingreso", terminal: false },
  { id: "screening", label: "Pre-filtro CV", terminal: false },
  { id: "hr_interview", label: "Entrevista RRHH", terminal: false },
  { id: "tech_interview", label: "Entrevista área", terminal: false, optional: true },
  { id: "final_eval", label: "Evaluación final", terminal: false, optional: true },
  { id: "offer", label: "Oferta", terminal: false },
  { id: "hired", label: "Contratado", terminal: true },
  { id: "rejected", label: "Rechazado", terminal: true }
];

const ORDERED_STAGES = STAGES.filter((stage) => !stage.terminal).map((stage) => stage.id);
const TERMINAL_STAGES = ["hired", "rejected"];

const ROLES = {
  admin: {
    label: "Administrador",
    permissions: ["manageVacancies", "manageCandidates", "moveStages", "evaluate", "schedule", "viewDashboard"]
  },
  recruiter: {
    label: "Responsable reclutamiento",
    permissions: ["manageVacancies", "manageCandidates", "moveStages", "evaluate", "schedule", "viewDashboard"]
  },
  interviewer: {
    label: "Entrevistador",
    permissions: ["evaluate", "schedule", "viewDashboard"]
  },
  viewer: {
    label: "Consulta",
    permissions: ["viewDashboard"]
  }
};

const SOURCES = ["LinkedIn", "Referido", "Portal empleo", "Base interna", "Otro"];

const state = {
  data: loadData(),
  activeView: "dashboard",
  activeRole: "recruiter",
  selectedCandidateId: null,
  filters: {
    search: "",
    vacancyId: "all"
  }
};

const refs = {
  tabs: document.querySelectorAll(".tab"),
  views: {
    dashboard: document.getElementById("dashboard-view"),
    vacancies: document.getElementById("vacancies-view"),
    pipeline: document.getElementById("pipeline-view"),
    settings: document.getElementById("settings-view")
  },
  roleSelect: document.getElementById("active-role"),
  resetData: document.getElementById("reset-data"),
  kpiGrid: document.getElementById("kpi-grid"),
  funnelChart: document.getElementById("funnel-chart"),
  upcomingInterviews: document.getElementById("upcoming-interviews"),
  risksList: document.getElementById("risks-list"),
  vacancyForm: document.getElementById("vacancy-form"),
  vacancyTable: document.getElementById("vacancy-table"),
  candidateForm: document.getElementById("candidate-form"),
  candidateVacancy: document.getElementById("candidate-vacancy"),
  pipelineVacancyFilter: document.getElementById("pipeline-vacancy-filter"),
  searchInput: document.getElementById("search-input"),
  pipelineBoard: document.getElementById("pipeline-board"),
  dialog: document.getElementById("candidate-dialog"),
  dialogTitle: document.getElementById("dialog-title"),
  dialogContent: document.getElementById("dialog-content"),
  movePrev: document.getElementById("move-prev"),
  moveNext: document.getElementById("move-next"),
  markHired: document.getElementById("mark-hired"),
  markRejected: document.getElementById("mark-rejected"),
  noteTemplate: document.getElementById("note-form-template"),
  interviewTemplate: document.getElementById("interview-form-template"),
  scoreTemplate: document.getElementById("score-form-template")
};

init();

function init() {
  renderRoleSelector();
  bindGlobalEvents();
  render();
}

function bindGlobalEvents() {
  refs.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  refs.roleSelect.addEventListener("change", (event) => {
    state.activeRole = event.target.value;
    render();
  });

  refs.resetData.addEventListener("click", () => {
    if (!confirm("Se restaurarán datos demo. ¿Continuar?")) {
      return;
    }
    state.data = buildSeedData();
    persist();
    render();
  });

  refs.vacancyForm.addEventListener("submit", onCreateVacancy);
  refs.candidateForm.addEventListener("submit", onCreateCandidate);

  refs.searchInput.addEventListener("input", (event) => {
    state.filters.search = event.target.value.trim().toLowerCase();
    renderPipelineBoard();
  });

  refs.pipelineVacancyFilter.addEventListener("change", (event) => {
    state.filters.vacancyId = event.target.value;
    renderPipelineBoard();
  });

  refs.movePrev.addEventListener("click", () => shiftCandidateStage(-1));
  refs.moveNext.addEventListener("click", () => shiftCandidateStage(1));
  refs.markHired.addEventListener("click", () => setCandidateTerminal("hired"));
  refs.markRejected.addEventListener("click", () => setCandidateTerminal("rejected"));
}

function render() {
  updatePermissionsUI();
  renderTabs();
  renderVacancySelectors();
  renderVacancyTable();
  renderDashboard();
  renderPipelineBoard();
  syncDialogIfOpen();
}

function renderRoleSelector() {
  refs.roleSelect.innerHTML = Object.entries(ROLES)
    .map(([roleId, role]) => `<option value="${roleId}">${role.label}</option>`)
    .join("");
  refs.roleSelect.value = state.activeRole;
}

function updatePermissionsUI() {
  const canManageVacancies = can("manageVacancies");
  const canManageCandidates = can("manageCandidates");
  refs.vacancyForm
    .querySelectorAll("input, select, button")
    .forEach((el) => (el.disabled = !canManageVacancies));
  refs.candidateForm
    .querySelectorAll("input, select, button")
    .forEach((el) => (el.disabled = !canManageCandidates));
}

function switchView(viewName) {
  state.activeView = viewName;
  renderTabs();
}

function renderTabs() {
  refs.tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === state.activeView);
  });

  Object.entries(refs.views).forEach(([viewName, node]) => {
    node.classList.toggle("is-visible", viewName === state.activeView);
  });
}

function renderVacancySelectors() {
  const vacancyOptions = state.data.vacancies
    .map((vacancy) => `<option value="${vacancy.id}">${escapeHtml(vacancy.title)} (${escapeHtml(vacancy.area)})</option>`)
    .join("");

  refs.candidateVacancy.innerHTML = vacancyOptions || "<option value=''>Sin vacantes</option>";
  refs.candidateVacancy.disabled = !vacancyOptions;

  refs.pipelineVacancyFilter.innerHTML = `<option value="all">Todas</option>${vacancyOptions}`;
  refs.pipelineVacancyFilter.value = state.filters.vacancyId;
}

function renderVacancyTable() {
  const rows = state.data.vacancies.map((vacancy) => {
    const candidatesCount = state.data.candidates.filter((candidate) => candidate.vacancyId === vacancy.id).length;
    const statusLabel = vacancy.status === "open" ? "Abierta" : vacancy.status === "paused" ? "Pausada" : "Cerrada";
    return `
      <tr>
        <td>${escapeHtml(vacancy.title)}</td>
        <td>${escapeHtml(vacancy.area)}</td>
        <td>${escapeHtml(vacancy.seniority)}</td>
        <td>${vacancy.openings}</td>
        <td>${candidatesCount}</td>
        <td>${statusLabel}</td>
      </tr>
    `;
  });

  refs.vacancyTable.innerHTML = rows.length
    ? rows.join("")
    : `<tr><td colspan="6" class="muted">No hay vacantes registradas.</td></tr>`;
}

function renderDashboard() {
  const metrics = calculateMetrics();
  refs.kpiGrid.innerHTML = [
    kpi("Candidatos activos", metrics.activeCandidates.toString()),
    kpi("Contratados", metrics.hired.toString()),
    kpi("Conversión a contratación", `${metrics.conversionRate}%`),
    kpi("Tiempo promedio a contratación", `${metrics.avgDaysToHire} días`),
    kpi("Entrevistas en 7 días", metrics.upcomingInterviews.toString())
  ].join("");

  refs.funnelChart.innerHTML = STAGES.map((stage) => {
    const value = metrics.funnelCounts[stage.id] || 0;
    const width = metrics.maxFunnel === 0 ? 1 : Math.max(4, (value / metrics.maxFunnel) * 100);
    return `
      <div class="funnel-row">
        <span>${stage.label}</span>
        <div class="bar" style="width:${width}%"></div>
        <strong>${value}</strong>
      </div>
    `;
  }).join("");

  renderUpcomingInterviews();
  renderRisks();
}

function renderUpcomingInterviews() {
  const now = Date.now();
  const nextWeek = now + 7 * 24 * 60 * 60 * 1000;
  const interviews = state.data.candidates
    .flatMap((candidate) =>
      candidate.interviews.map((interview) => ({
        candidate,
        interview
      }))
    )
    .filter((entry) => {
      const timestamp = new Date(entry.interview.date).getTime();
      return !Number.isNaN(timestamp) && timestamp >= now && timestamp <= nextWeek;
    })
    .sort((a, b) => new Date(a.interview.date) - new Date(b.interview.date))
    .slice(0, 6);

  refs.upcomingInterviews.innerHTML = interviews.length
    ? interviews
        .map(
          (entry) => `
            <li>
              <strong>${escapeHtml(entry.candidate.name)}</strong> · ${formatDateTime(entry.interview.date)}
              <span class="badge badge-warning">${entry.interview.mode}</span>
            </li>
          `
        )
        .join("")
    : `<li class="muted">No hay entrevistas agendadas para los próximos 7 días.</li>`;
}

function renderRisks() {
  const now = Date.now();
  const slowCandidates = state.data.candidates
    .filter((candidate) => !TERMINAL_STAGES.includes(candidate.stage))
    .filter((candidate) => daysDiff(candidate.updatedAt, now) > 10);
  const stalledVacancies = state.data.vacancies.filter((vacancy) => {
    if (vacancy.status !== "open") {
      return false;
    }
    const activeInVacancy = state.data.candidates.filter(
      (candidate) => candidate.vacancyId === vacancy.id && !TERMINAL_STAGES.includes(candidate.stage)
    );
    return activeInVacancy.length === 0;
  });
  const lowSource = sourceMetrics().filter((source) => source.total >= 3 && source.hiredRate < 15);

  const risks = [];
  if (slowCandidates.length) {
    risks.push(
      `${slowCandidates.length} candidato(s) sin avance >10 días <span class="badge badge-danger">Urgente</span>`
    );
  }
  if (stalledVacancies.length) {
    risks.push(`${stalledVacancies.length} vacante(s) abiertas sin candidatos activos.`);
  }
  if (lowSource.length) {
    risks.push(`${lowSource.length} fuente(s) con conversión baja (<15%).`);
  }

  refs.risksList.innerHTML = risks.length
    ? risks.map((risk) => `<li>${risk}</li>`).join("")
    : `<li>Sin riesgos críticos detectados <span class="badge badge-success">OK</span></li>`;
}

function renderPipelineBoard() {
  const filtered = getFilteredCandidates();

  refs.pipelineBoard.innerHTML = STAGES.map((stage) => {
    const candidates = filtered.filter((candidate) => candidate.stage === stage.id);
    return `
      <article class="stage-column">
        <header class="stage-head">
          <h3>${stage.label}</h3>
          <span class="stage-count">${candidates.length}</span>
        </header>
        <div class="candidate-list">
          ${candidates.length ? candidates.map((candidate) => candidateCard(candidate)).join("") : `<p class="empty-state">Sin candidatos</p>`}
        </div>
      </article>
    `;
  }).join("");

  refs.pipelineBoard.querySelectorAll(".candidate-card").forEach((card) => {
    card.addEventListener("click", () => openCandidateDialog(card.dataset.id));
  });
}

function candidateCard(candidate) {
  const vacancy = findVacancy(candidate.vacancyId);
  const avgScore = averageScore(candidate);
  const scoreLabel = avgScore === null ? "Sin score" : `${avgScore.toFixed(1)}/5`;
  return `
    <article class="candidate-card" data-id="${candidate.id}">
      <strong>${escapeHtml(candidate.name)}</strong>
      <p>${escapeHtml(candidate.email)}</p>
      <p>${vacancy ? escapeHtml(vacancy.title) : "Vacante eliminada"}</p>
      <p>Fuente: ${escapeHtml(candidate.source)}</p>
      <p>Score: ${scoreLabel}</p>
    </article>
  `;
}

function openCandidateDialog(candidateId) {
  state.selectedCandidateId = candidateId;
  syncDialogIfOpen(true);
}

function syncDialogIfOpen(forceOpen = false) {
  const candidate = selectedCandidate();
  if (!candidate) {
    return;
  }
  if (forceOpen && !refs.dialog.open) {
    refs.dialog.showModal();
  }
  if (!refs.dialog.open) {
    return;
  }

  const vacancy = findVacancy(candidate.vacancyId);
  refs.dialogTitle.textContent = candidate.name;

  const notesHtml = candidate.notes.length
    ? `<ul class="timeline">${candidate.notes
        .slice()
        .reverse()
        .map(
          (note) =>
            `<li><strong>${formatDateTime(note.createdAt)}</strong><br />${escapeHtml(note.text)}</li>`
        )
        .join("")}</ul>`
    : `<p class="muted">Sin notas.</p>`;

  const interviewsHtml = candidate.interviews.length
    ? `<ul class="timeline">${candidate.interviews
        .slice()
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(
          (item) =>
            `<li><strong>${formatDateTime(item.date)}</strong> · ${escapeHtml(item.mode)}<br />Etapa: ${stageLabel(
              item.stage
            )}</li>`
        )
        .join("")}</ul>`
    : `<p class="muted">Sin entrevistas agendadas.</p>`;

  const scoresHtml = candidate.scores.length
    ? `<ul class="timeline">${candidate.scores
        .slice()
        .reverse()
        .map(
          (score) =>
            `<li><strong>${escapeHtml(score.criterion)}</strong> · ${score.value}/5<br />${escapeHtml(score.comment || "-")}</li>`
        )
        .join("")}</ul>`
    : `<p class="muted">Sin evaluaciones.</p>`;

  refs.dialogContent.innerHTML = `
    <section class="dialog-grid">
      <p><strong>Vacante:</strong><br />${vacancy ? escapeHtml(vacancy.title) : "Sin vacante"}</p>
      <p><strong>Etapa:</strong><br />${stageLabel(candidate.stage)}</p>
      <p><strong>Fuente:</strong><br />${escapeHtml(candidate.source)}</p>
      <p><strong>Pretensión:</strong><br />USD ${Number(candidate.salary).toLocaleString("es-CL")}</p>
      <p><strong>Última actualización:</strong><br />${formatDateTime(candidate.updatedAt)}</p>
      <p><strong>Score promedio:</strong><br />${
        averageScore(candidate) === null ? "Sin score" : averageScore(candidate).toFixed(1) + "/5"
      }</p>
    </section>

    <section>
      <h3>Evaluar</h3>
      <div id="score-form-wrap"></div>
      ${scoresHtml}
    </section>

    <section>
      <h3>Agendar entrevista</h3>
      <div id="interview-form-wrap"></div>
      ${interviewsHtml}
    </section>

    <section>
      <h3>Notas</h3>
      <div id="note-form-wrap"></div>
      ${notesHtml}
    </section>
  `;

  mountDialogForms(candidate);
  syncDialogActions(candidate);
}

function mountDialogForms(candidate) {
  const noteWrap = refs.dialogContent.querySelector("#note-form-wrap");
  const interviewWrap = refs.dialogContent.querySelector("#interview-form-wrap");
  const scoreWrap = refs.dialogContent.querySelector("#score-form-wrap");

  noteWrap.appendChild(refs.noteTemplate.content.cloneNode(true));
  interviewWrap.appendChild(refs.interviewTemplate.content.cloneNode(true));
  scoreWrap.appendChild(refs.scoreTemplate.content.cloneNode(true));

  const noteForm = noteWrap.querySelector("form");
  const interviewForm = interviewWrap.querySelector("form");
  const scoreForm = scoreWrap.querySelector("form");

  noteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!can("manageCandidates")) {
      alert("Rol sin permisos para agregar notas.");
      return;
    }
    const note = event.target.note.value.trim();
    if (!note) return;
    candidate.notes.push({
      id: uid(),
      text: note,
      createdAt: nowISO(),
      authorRole: state.activeRole
    });
    touchCandidate(candidate);
    persist();
    syncDialogIfOpen();
    renderDashboard();
    renderPipelineBoard();
  });

  interviewForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!can("schedule")) {
      alert("Rol sin permisos para agendar entrevistas.");
      return;
    }
    const date = event.target.date.value;
    if (!date) return;
    candidate.interviews.push({
      id: uid(),
      date,
      mode: event.target.mode.value,
      stage: candidate.stage
    });
    touchCandidate(candidate);
    persist();
    syncDialogIfOpen();
    renderDashboard();
  });

  scoreForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!can("evaluate")) {
      alert("Rol sin permisos para evaluar.");
      return;
    }
    const criterion = event.target.criterion.value.trim();
    const value = Number(event.target.elements.value.value);
    if (!criterion || value < 1 || value > 5) return;
    candidate.scores.push({
      id: uid(),
      criterion,
      value,
      comment: "",
      createdAt: nowISO(),
      authorRole: state.activeRole
    });
    touchCandidate(candidate);
    persist();
    syncDialogIfOpen();
    renderPipelineBoard();
  });

  const formsEnabled = can("manageCandidates") || can("schedule") || can("evaluate");
  if (!formsEnabled) {
    noteForm.querySelectorAll("textarea, button").forEach((el) => (el.disabled = true));
    interviewForm.querySelectorAll("input, select, button").forEach((el) => (el.disabled = true));
    scoreForm.querySelectorAll("input, button").forEach((el) => (el.disabled = true));
  } else {
    noteForm.querySelectorAll("textarea, button").forEach((el) => (el.disabled = !can("manageCandidates")));
    interviewForm.querySelectorAll("input, select, button").forEach((el) => (el.disabled = !can("schedule")));
    scoreForm.querySelectorAll("input, button").forEach((el) => (el.disabled = !can("evaluate")));
  }
}

function syncDialogActions(candidate) {
  const stageIndex = ORDERED_STAGES.indexOf(candidate.stage);
  const canMove = can("moveStages");

  refs.movePrev.disabled = !canMove || stageIndex <= 0;
  refs.moveNext.disabled = !canMove || stageIndex === -1 || stageIndex >= ORDERED_STAGES.length - 1;
  refs.markHired.disabled = !canMove || candidate.stage !== "offer";
  refs.markRejected.disabled = !canMove || candidate.stage === "hired" || candidate.stage === "rejected";
}

function shiftCandidateStage(direction) {
  const candidate = selectedCandidate();
  if (!candidate) return;
  if (!can("moveStages")) {
    alert("Rol sin permisos para mover etapas.");
    return;
  }
  const currentIndex = ORDERED_STAGES.indexOf(candidate.stage);
  if (currentIndex === -1) return;
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= ORDERED_STAGES.length) return;
  updateCandidateStage(candidate, ORDERED_STAGES[targetIndex]);
}

function setCandidateTerminal(terminalStage) {
  const candidate = selectedCandidate();
  if (!candidate) return;
  if (!can("moveStages")) {
    alert("Rol sin permisos para cerrar candidato.");
    return;
  }
  updateCandidateStage(candidate, terminalStage);
}

function updateCandidateStage(candidate, targetStage) {
  if (!STAGES.some((stage) => stage.id === targetStage)) return;
  candidate.stage = targetStage;
  if (targetStage === "hired" && !candidate.hiredAt) {
    candidate.hiredAt = nowISO();
  }
  if (targetStage !== "hired") {
    candidate.hiredAt = null;
  }
  candidate.history.push({ id: uid(), stage: targetStage, movedAt: nowISO(), byRole: state.activeRole });
  touchCandidate(candidate);
  persist();
  syncDialogIfOpen();
  renderDashboard();
  renderPipelineBoard();
}

function onCreateVacancy(event) {
  event.preventDefault();
  if (!can("manageVacancies")) {
    alert("Rol sin permisos para crear vacantes.");
    return;
  }
  const form = new FormData(event.target);
  const vacancy = {
    id: uid(),
    title: form.get("title").trim(),
    area: form.get("area").trim(),
    seniority: form.get("seniority"),
    openings: Number(form.get("openings") || 1),
    targetDate: form.get("targetDate") || null,
    status: form.get("status"),
    createdAt: nowISO()
  };
  state.data.vacancies.push(vacancy);
  persist();
  event.target.reset();
  renderVacancySelectors();
  renderVacancyTable();
}

function onCreateCandidate(event) {
  event.preventDefault();
  if (!can("manageCandidates")) {
    alert("Rol sin permisos para crear candidatos.");
    return;
  }
  if (!state.data.vacancies.length) {
    alert("Debes crear una vacante antes de cargar candidatos.");
    return;
  }
  const form = new FormData(event.target);
  const candidate = {
    id: uid(),
    name: form.get("name").trim(),
    email: form.get("email").trim(),
    phone: form.get("phone").trim(),
    source: form.get("source"),
    vacancyId: form.get("vacancyId"),
    salary: Number(form.get("salary") || 0),
    stage: "intake",
    notes: [],
    interviews: [],
    scores: [],
    history: [{ id: uid(), stage: "intake", movedAt: nowISO(), byRole: state.activeRole }],
    createdAt: nowISO(),
    updatedAt: nowISO(),
    hiredAt: null
  };
  state.data.candidates.push(candidate);
  persist();
  event.target.reset();
  renderDashboard();
  renderVacancyTable();
  renderPipelineBoard();
}

function getFilteredCandidates() {
  return state.data.candidates.filter((candidate) => {
    const matchesSearch =
      !state.filters.search ||
      candidate.name.toLowerCase().includes(state.filters.search) ||
      candidate.email.toLowerCase().includes(state.filters.search);
    const matchesVacancy = state.filters.vacancyId === "all" || candidate.vacancyId === state.filters.vacancyId;
    return matchesSearch && matchesVacancy;
  });
}

function calculateMetrics() {
  const activeCandidates = state.data.candidates.filter((candidate) => !TERMINAL_STAGES.includes(candidate.stage)).length;
  const hiredCandidates = state.data.candidates.filter((candidate) => candidate.stage === "hired");
  const hired = hiredCandidates.length;
  const conversionRate = state.data.candidates.length
    ? ((hired / state.data.candidates.length) * 100).toFixed(1)
    : "0.0";

  const daysToHire = hiredCandidates
    .map((candidate) => (candidate.hiredAt ? daysDiff(candidate.createdAt, candidate.hiredAt) : null))
    .filter((value) => value !== null);
  const avgDaysToHire = daysToHire.length
    ? (daysToHire.reduce((acc, value) => acc + value, 0) / daysToHire.length).toFixed(1)
    : "0.0";

  const now = Date.now();
  const nextWeek = now + 7 * 24 * 60 * 60 * 1000;
  const upcomingInterviews = state.data.candidates
    .flatMap((candidate) => candidate.interviews)
    .filter((interview) => {
      const ts = new Date(interview.date).getTime();
      return !Number.isNaN(ts) && ts >= now && ts <= nextWeek;
    }).length;

  const funnelCounts = STAGES.reduce((acc, stage) => {
    acc[stage.id] = state.data.candidates.filter((candidate) => candidate.stage === stage.id).length;
    return acc;
  }, {});
  const maxFunnel = Math.max(...Object.values(funnelCounts), 0);

  return {
    activeCandidates,
    hired,
    conversionRate,
    avgDaysToHire,
    upcomingInterviews,
    funnelCounts,
    maxFunnel
  };
}

function sourceMetrics() {
  return SOURCES.map((source) => {
    const fromSource = state.data.candidates.filter((candidate) => candidate.source === source);
    const total = fromSource.length;
    const hired = fromSource.filter((candidate) => candidate.stage === "hired").length;
    return {
      source,
      total,
      hired,
      hiredRate: total ? (hired / total) * 100 : 0
    };
  });
}

function selectedCandidate() {
  return state.data.candidates.find((candidate) => candidate.id === state.selectedCandidateId) || null;
}

function can(permission) {
  return ROLES[state.activeRole].permissions.includes(permission);
}

function findVacancy(vacancyId) {
  return state.data.vacancies.find((vacancy) => vacancy.id === vacancyId) || null;
}

function touchCandidate(candidate) {
  candidate.updatedAt = nowISO();
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = buildSeedData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.vacancies) || !Array.isArray(parsed.candidates)) {
      throw new Error("Formato inválido");
    }
    return parsed;
  } catch (_error) {
    const seed = buildSeedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
}

function buildSeedData() {
  const now = Date.now();
  const vacancyA = {
    id: uid(),
    title: "Analista de Operaciones",
    area: "Operaciones",
    seniority: "Semi Senior",
    openings: 2,
    targetDate: isoDate(now + 28 * 24 * 60 * 60 * 1000),
    status: "open",
    createdAt: nowISO()
  };
  const vacancyB = {
    id: uid(),
    title: "Coordinador de Talento",
    area: "RRHH",
    seniority: "Senior",
    openings: 1,
    targetDate: isoDate(now + 21 * 24 * 60 * 60 * 1000),
    status: "open",
    createdAt: nowISO()
  };

  const c1Created = new Date(now - 12 * 24 * 60 * 60 * 1000).toISOString();
  const c2Created = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
  const c3Created = new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString();
  const c4Created = new Date(now - 18 * 24 * 60 * 60 * 1000).toISOString();

  return {
    vacancies: [vacancyA, vacancyB],
    candidates: [
      {
        id: uid(),
        name: "María Torres",
        email: "maria.torres@mail.com",
        phone: "+56 9 1111 2233",
        source: "LinkedIn",
        vacancyId: vacancyA.id,
        salary: 1700,
        stage: "hr_interview",
        notes: [
          {
            id: uid(),
            text: "Buen ajuste técnico inicial.",
            createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
            authorRole: "recruiter"
          }
        ],
        interviews: [
          {
            id: uid(),
            date: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
            mode: "Virtual",
            stage: "hr_interview"
          }
        ],
        scores: [{ id: uid(), criterion: "Comunicación", value: 4, comment: "", createdAt: c1Created, authorRole: "recruiter" }],
        history: [{ id: uid(), stage: "hr_interview", movedAt: c1Created, byRole: "recruiter" }],
        createdAt: c1Created,
        updatedAt: c1Created,
        hiredAt: null
      },
      {
        id: uid(),
        name: "Tomás Aguilera",
        email: "tomas.aguilera@mail.com",
        phone: "+56 9 3333 5566",
        source: "Referido",
        vacancyId: vacancyA.id,
        salary: 1900,
        stage: "offer",
        notes: [],
        interviews: [
          {
            id: uid(),
            date: new Date(now + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
            mode: "Presencial",
            stage: "final_eval"
          }
        ],
        scores: [
          { id: uid(), criterion: "Liderazgo", value: 5, comment: "", createdAt: c2Created, authorRole: "recruiter" },
          { id: uid(), criterion: "Conocimiento técnico", value: 4, comment: "", createdAt: c2Created, authorRole: "interviewer" }
        ],
        history: [{ id: uid(), stage: "offer", movedAt: c2Created, byRole: "recruiter" }],
        createdAt: c2Created,
        updatedAt: c2Created,
        hiredAt: null
      },
      {
        id: uid(),
        name: "Daniela Soto",
        email: "daniela.soto@mail.com",
        phone: "+56 9 7888 9900",
        source: "Portal empleo",
        vacancyId: vacancyB.id,
        salary: 2100,
        stage: "hired",
        notes: [{ id: uid(), text: "Oferta aceptada.", createdAt: c3Created, authorRole: "recruiter" }],
        interviews: [],
        scores: [{ id: uid(), criterion: "Ajuste cultural", value: 5, comment: "", createdAt: c3Created, authorRole: "recruiter" }],
        history: [{ id: uid(), stage: "hired", movedAt: c3Created, byRole: "admin" }],
        createdAt: c3Created,
        updatedAt: c3Created,
        hiredAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: uid(),
        name: "Nicolás Pérez",
        email: "nicolas.perez@mail.com",
        phone: "+56 9 6123 4444",
        source: "LinkedIn",
        vacancyId: vacancyB.id,
        salary: 2000,
        stage: "screening",
        notes: [],
        interviews: [],
        scores: [],
        history: [{ id: uid(), stage: "screening", movedAt: c4Created, byRole: "recruiter" }],
        createdAt: c4Created,
        updatedAt: c4Created,
        hiredAt: null
      }
    ]
  };
}

function kpi(label, value) {
  return `
    <article class="kpi">
      <p>${label}</p>
      <strong>${value}</strong>
    </article>
  `;
}

function stageLabel(stageId) {
  const stage = STAGES.find((item) => item.id === stageId);
  return stage ? stage.label : "Etapa desconocida";
}

function averageScore(candidate) {
  if (!candidate.scores.length) return null;
  const total = candidate.scores.reduce((acc, score) => acc + Number(score.value || 0), 0);
  return total / candidate.scores.length;
}

function uid() {
  return `${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-5)}`;
}

function nowISO() {
  return new Date().toISOString();
}

function isoDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function daysDiff(start, end) {
  const startDate = new Date(start).getTime();
  const endDate = new Date(end).getTime();
  return Math.max(0, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)));
}

function formatDateTime(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
