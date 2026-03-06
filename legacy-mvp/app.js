const STORAGE_KEY = "sgc_pyme_contratos_v2";
const ROLE_KEY = "sgc_pyme_active_role_v2";
const SCHEMA_VERSION = 3;

const TENDER_STATUSES = [
  { id: "draft", label: "En preparacion" },
  { id: "submitted", label: "Presentada" },
  { id: "won", label: "Adjudicada" },
  { id: "lost", label: "No adjudicada" }
];

const CONTRACT_STATUSES = [
  { id: "planning", label: "Planificacion" },
  { id: "active", label: "Activo" },
  { id: "at_risk", label: "En riesgo" },
  { id: "closed", label: "Cerrado" }
];

const OPERATION_TASK_STATUSES = [
  { id: "todo", label: "Pendiente" },
  { id: "doing", label: "En progreso" },
  { id: "blocked", label: "Bloqueada" },
  { id: "done", label: "Completada" }
];

const VACANCY_STATUSES = [
  { id: "open", label: "Abierta" },
  { id: "paused", label: "Pausada" },
  { id: "closed", label: "Cerrada" }
];

const CANDIDATE_STAGES = [
  { id: "intake", label: "Ingreso", terminal: false },
  { id: "screening", label: "Filtro CV", terminal: false },
  { id: "interview", label: "Entrevista", terminal: false },
  { id: "offer", label: "Oferta", terminal: false },
  { id: "hired", label: "Contratado", terminal: true },
  { id: "rejected", label: "Rechazado", terminal: true }
];

const EMPLOYMENT_STATUSES = [
  { id: "active", label: "Activo" },
  { id: "on_leave", label: "Licencia" },
  { id: "inactive", label: "Inactivo" }
];

const PERSON_DOC_STATUSES = [
  { id: "uploaded", label: "Cargado" },
  { id: "pending", label: "Pendiente" },
  { id: "expiring", label: "Por vencer" },
  { id: "expired", label: "Vencido" }
];

const REQUIRED_PERSON_DOC_TYPES = ["Contrato", "Carnet"];

const TERMINAL_CANDIDATE_STAGES = new Set(CANDIDATE_STAGES.filter((item) => item.terminal).map((item) => item.id));

const ROLES = {
  admin: {
    label: "Administrador",
    permissions: ["manageTenders", "manageContracts", "manageOperations", "manageFinance", "manageHr", "resetDemo"]
  },
  tender_lead: {
    label: "Lider Licitaciones",
    permissions: ["manageTenders", "manageContracts"]
  },
  contract_manager: {
    label: "Contract Manager",
    permissions: ["manageContracts", "manageOperations"]
  },
  finance: {
    label: "Analista Finanzas",
    permissions: ["manageFinance"]
  },
  hr: {
    label: "Lider RRHH",
    permissions: ["manageHr"]
  },
  viewer: {
    label: "Solo lectura",
    permissions: []
  }
};

const state = {
  data: loadData(),
  activeRole: loadRole(),
  page: document.body.dataset.page || "dashboard",
  filters: {
    tenderStatus: "all"
  }
};

const commonRefs = {
  roleSelect: document.getElementById("active-role"),
  resetData: document.getElementById("reset-data"),
  navEntries: document.querySelectorAll("[data-nav]"),
  navGroups: document.querySelectorAll(".nav-group"),
  sideNav: document.getElementById("side-nav"),
  navOverlay: document.getElementById("nav-overlay"),
  menuToggle: document.getElementById("menu-toggle")
};

const pageFactories = {
  dashboard: createDashboardController,
  tenders: createTendersController,
  contracts: createContractsController,
  operations: createOperationsController,
  finance: createFinanceController,
  hr: createHrController,
  hr_people: createHrPeopleController,
  architecture: createArchitectureController
};

let pageController = null;

init();

function init() {
  if (!ROLES[state.activeRole]) {
    state.activeRole = "admin";
  }

  bindCommonEvents();
  renderCommonUI();

  const factory = pageFactories[state.page];
  if (!factory) {
    return;
  }

  pageController = factory();
  if (pageController.init) {
    pageController.init();
  }
  renderPage();
}

function renderPage() {
  renderCommonUI();
  if (pageController && pageController.render) {
    pageController.render();
  }
}

function bindCommonEvents() {
  if (commonRefs.menuToggle) {
    commonRefs.menuToggle.addEventListener("click", () => {
      const isOpen = document.body.classList.contains("nav-open");
      setNavOpen(!isOpen);
    });
  }

  if (commonRefs.navOverlay) {
    commonRefs.navOverlay.addEventListener("click", () => setNavOpen(false));
  }

  if (commonRefs.sideNav) {
    commonRefs.sideNav.addEventListener("click", (event) => {
      if (event.target.closest(".nav-link, .nav-sublink")) {
        setNavOpen(false);
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setNavOpen(false);
    }
  });

  if (commonRefs.roleSelect) {
    commonRefs.roleSelect.addEventListener("change", (event) => {
      state.activeRole = event.target.value;
      localStorage.setItem(ROLE_KEY, state.activeRole);
      renderPage();
    });
  }

  if (commonRefs.resetData) {
    commonRefs.resetData.addEventListener("click", () => {
      if (!can("resetDemo")) {
        alert("Tu rol no puede reiniciar la demo.");
        return;
      }
      if (!confirm("Se restauraran todos los datos demo. Continuar?")) {
        return;
      }
      state.data = buildSeedData();
      persist();
      renderPage();
    });
  }
}

function renderCommonUI() {
  if (commonRefs.roleSelect) {
    commonRefs.roleSelect.innerHTML = Object.entries(ROLES)
      .map(([roleId, role]) => `<option value="${roleId}">${escapeHtml(role.label)}</option>`)
      .join("");
    commonRefs.roleSelect.value = state.activeRole;
  }

  if (commonRefs.resetData) {
    commonRefs.resetData.disabled = !can("resetDemo");
  }

  commonRefs.navEntries.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.nav === state.page);
  });

  commonRefs.navGroups.forEach((group) => {
    const hasActiveChild = !!group.querySelector(".is-active");
    group.classList.toggle("has-active", hasActiveChild);
  });

  if (commonRefs.menuToggle) {
    commonRefs.menuToggle.setAttribute("aria-expanded", String(document.body.classList.contains("nav-open")));
  }
}

function setNavOpen(isOpen) {
  document.body.classList.toggle("nav-open", isOpen);
  if (commonRefs.menuToggle) {
    commonRefs.menuToggle.setAttribute("aria-expanded", String(isOpen));
  }
}

function createDashboardController() {
  const refs = {
    kpis: document.getElementById("dashboard-kpis"),
    alerts: document.getElementById("alerts-list"),
    moduleHealth: document.getElementById("module-health"),
    tenderFunnel: document.getElementById("tender-funnel"),
    deadlines: document.getElementById("next-deadlines")
  };

  return {
    init() {},
    render() {
      if (!refs.kpis) return;

      const metrics = getDashboardMetrics();

      refs.kpis.innerHTML = [
        kpiCard("Licitaciones abiertas", metrics.openTenders),
        kpiCard("Contratos activos", metrics.activeContracts),
        kpiCard("Contratos en riesgo", metrics.riskContracts),
        kpiCard("Flujo caja pagado", formatCurrency(metrics.cashBalance)),
        kpiCard("Pendiente por cobrar", formatCurrency(metrics.pendingReceivable)),
        kpiCard("Tareas bloqueadas", metrics.blockedTasks)
      ].join("");

      const alerts = buildDashboardAlerts(metrics);
      refs.alerts.innerHTML = alerts.length
        ? alerts.map((alert) => `<li>${escapeHtml(alert)}</li>`).join("")
        : '<li class="muted">Sin alertas criticas hoy.</li>';

      refs.moduleHealth.innerHTML = [
        moduleHealthCard("Licitaciones", `${metrics.winRate}% win rate`, metrics.winRate >= 30 ? "good" : "warn"),
        moduleHealthCard("Contratos", `${metrics.riskContracts} en riesgo`, metrics.riskContracts === 0 ? "good" : "risk"),
        moduleHealthCard(
          "Operaciones",
          `${metrics.blockedTasks} bloqueada(s)`,
          metrics.blockedTasks <= 1 ? "good" : "risk"
        ),
        moduleHealthCard(
          "Finanzas",
          `${formatCurrency(metrics.monthNetFlow)} neto mes`,
          metrics.monthNetFlow >= 0 ? "good" : "warn"
        ),
        moduleHealthCard(
          "RRHH Vacantes",
          `${metrics.openVacancies} vacante(s) abierta(s)`,
          metrics.openVacancies <= 3 ? "good" : "warn"
        ),
        moduleHealthCard(
          "RRHH Pipeline",
          `${metrics.activeCandidates} candidato(s) activo(s)`,
          metrics.activeCandidates > 0 ? "good" : "warn"
        )
      ].join("");

      const tenderCounts = countByStatus(state.data.tenders, TENDER_STATUSES);
      const maxTenderCount = Math.max(...Object.values(tenderCounts), 0);
      refs.tenderFunnel.innerHTML = TENDER_STATUSES.map((status) => {
        const value = tenderCounts[status.id] || 0;
        const width = maxTenderCount === 0 ? 10 : Math.max(10, (value / maxTenderCount) * 100);
        return `
          <div class="pipeline-mini-row">
            <span>${escapeHtml(status.label)}</span>
            <div class="bar-wrap"><div class="bar" style="width:${width}%"></div></div>
            <strong>${value}</strong>
          </div>
        `;
      }).join("");

      const upcoming = getUpcomingMilestones().slice(0, 8);
      refs.deadlines.innerHTML = upcoming.length
        ? upcoming
            .map(
              (item) =>
                `<li><strong>${escapeHtml(item.title)}</strong><br />${escapeHtml(item.module)} - ${formatDate(item.date)}</li>`
            )
            .join("")
        : '<li class="muted">No hay hitos en los proximos dias.</li>';
    }
  };
}

function createTendersController() {
  const refs = {
    kpis: document.getElementById("tender-kpis"),
    form: document.getElementById("tender-form"),
    filter: document.getElementById("tender-status-filter"),
    table: document.getElementById("tenders-table")
  };

  return {
    init() {
      if (refs.form) {
        refs.form.addEventListener("submit", (event) => {
          event.preventDefault();
          if (!can("manageTenders")) {
            alert("Tu rol no puede crear licitaciones.");
            return;
          }

          const form = new FormData(event.target);
          state.data.tenders.push({
            id: uid(),
            title: String(form.get("title") || "").trim(),
            client: String(form.get("client") || "").trim(),
            amount: Number(form.get("amount") || 0),
            closeDate: String(form.get("closeDate") || isoDate(Date.now())),
            probability: clamp(Number(form.get("probability") || 0), 0, 100),
            responsible: String(form.get("responsible") || "").trim(),
            status: String(form.get("status") || "draft"),
            createdAt: nowISO()
          });
          persist();
          event.target.reset();
          renderPage();
        });
      }

      if (refs.filter) {
        refs.filter.addEventListener("change", (event) => {
          state.filters.tenderStatus = event.target.value;
          renderPage();
        });
      }

      if (refs.table) {
        refs.table.addEventListener("change", (event) => {
          const select = event.target.closest(".tender-status-select");
          if (!select) return;
          if (!can("manageTenders")) {
            alert("Tu rol no puede cambiar estado de licitaciones.");
            renderPage();
            return;
          }

          const tender = state.data.tenders.find((item) => item.id === select.dataset.id);
          if (!tender) return;
          tender.status = select.value;
          persist();
          renderPage();
        });
      }
    },

    render() {
      if (!refs.kpis) return;

      const total = state.data.tenders.length;
      const won = state.data.tenders.filter((item) => item.status === "won").length;
      const lost = state.data.tenders.filter((item) => item.status === "lost").length;
      const submitted = state.data.tenders.filter((item) => item.status === "submitted").length;
      const open = state.data.tenders.filter((item) => item.status === "draft" || item.status === "submitted").length;
      const decided = won + lost;
      const winRate = decided ? ((won / decided) * 100).toFixed(1) : "0.0";
      const pipelineAmount = state.data.tenders
        .filter((item) => item.status === "draft" || item.status === "submitted")
        .reduce((acc, item) => acc + item.amount, 0);

      refs.kpis.innerHTML = [
        kpiCard("Licitaciones totales", total),
        kpiCard("Abiertas", open),
        kpiCard("Presentadas", submitted),
        kpiCard("Win rate", `${winRate}%`),
        kpiCard("Pipeline potencial", formatCurrency(pipelineAmount))
      ].join("");

      if (refs.form) {
        disableForm(refs.form, !can("manageTenders"));
      }

      if (refs.filter) {
        refs.filter.value = state.filters.tenderStatus;
      }

      const filtered = state.data.tenders
        .filter((item) => state.filters.tenderStatus === "all" || item.status === state.filters.tenderStatus)
        .sort((a, b) => new Date(a.closeDate) - new Date(b.closeDate));

      refs.table.innerHTML = filtered.length
        ? filtered
            .map((tender) => {
              return `
                <tr>
                  <td>${escapeHtml(tender.title)}</td>
                  <td>${escapeHtml(tender.client)}</td>
                  <td>${formatCurrency(tender.amount)}</td>
                  <td>${formatDate(tender.closeDate)}</td>
                  <td>${tender.probability}%</td>
                  <td>${escapeHtml(tender.responsible)}</td>
                  <td>
                    <select class="tender-status-select" data-id="${tender.id}" ${can("manageTenders") ? "" : "disabled"}>
                      ${TENDER_STATUSES.map(
                        (status) =>
                          `<option value="${status.id}" ${status.id === tender.status ? "selected" : ""}>${escapeHtml(
                            status.label
                          )}</option>`
                      ).join("")}
                    </select>
                  </td>
                </tr>
              `;
            })
            .join("")
        : '<tr><td colspan="7" class="muted">No hay licitaciones para el filtro seleccionado.</td></tr>';
    }
  };
}
function createContractsController() {
  const refs = {
    kpis: document.getElementById("contracts-kpis"),
    form: document.getElementById("contract-form"),
    tenderSelect: document.getElementById("contract-tender-select"),
    table: document.getElementById("contracts-table")
  };

  return {
    init() {
      if (refs.form) {
        refs.form.addEventListener("submit", (event) => {
          event.preventDefault();
          if (!can("manageContracts")) {
            alert("Tu rol no puede crear contratos.");
            return;
          }

          const form = new FormData(event.target);
          const tenderId = String(form.get("tenderId") || "").trim();
          state.data.contracts.push({
            id: uid(),
            tenderId: tenderId || null,
            name: String(form.get("name") || "").trim(),
            client: String(form.get("client") || "").trim(),
            totalValue: Number(form.get("totalValue") || 0),
            costEstimate: Number(form.get("costEstimate") || 0),
            startDate: String(form.get("startDate") || isoDate(Date.now())),
            endDate: String(form.get("endDate") || isoDate(Date.now())),
            manager: String(form.get("manager") || "").trim(),
            status: String(form.get("status") || "planning"),
            progress: clamp(Number(form.get("progress") || 0), 0, 100),
            createdAt: nowISO()
          });
          persist();
          event.target.reset();
          renderPage();
        });
      }

      if (refs.table) {
        refs.table.addEventListener("change", (event) => {
          const statusSelect = event.target.closest(".contract-status-select");
          if (statusSelect) {
            if (!can("manageContracts")) {
              alert("Tu rol no puede cambiar estado de contratos.");
              renderPage();
              return;
            }
            const contract = state.data.contracts.find((item) => item.id === statusSelect.dataset.id);
            if (!contract) return;
            contract.status = statusSelect.value;
            persist();
            renderPage();
            return;
          }

          const progressInput = event.target.closest(".contract-progress-input");
          if (progressInput) {
            if (!can("manageContracts")) {
              alert("Tu rol no puede modificar avance.");
              renderPage();
              return;
            }
            const contract = state.data.contracts.find((item) => item.id === progressInput.dataset.id);
            if (!contract) return;
            contract.progress = clamp(Number(progressInput.value || 0), 0, 100);
            persist();
            renderPage();
          }
        });
      }
    },

    render() {
      if (!refs.kpis) return;

      const active = state.data.contracts.filter((item) => item.status === "active" || item.status === "at_risk").length;
      const atRisk = state.data.contracts.filter((item) => item.status === "at_risk").length;
      const totalValue = state.data.contracts.reduce((acc, item) => acc + item.totalValue, 0);
      const expectedMargin = state.data.contracts.reduce((acc, item) => {
        const margin = item.totalValue - item.costEstimate;
        return acc + margin;
      }, 0);

      refs.kpis.innerHTML = [
        kpiCard("Contratos totales", state.data.contracts.length),
        kpiCard("Activos", active),
        kpiCard("En riesgo", atRisk),
        kpiCard("Valor cartera", formatCurrency(totalValue)),
        kpiCard("Margen esperado", formatCurrency(expectedMargin))
      ].join("");

      if (refs.form) {
        disableForm(refs.form, !can("manageContracts"));
      }

      if (refs.tenderSelect) {
        const wonTenders = state.data.tenders.filter((item) => item.status === "won");
        refs.tenderSelect.innerHTML = `<option value="">Sin vinculacion</option>${wonTenders
          .map((tender) => `<option value="${tender.id}">${escapeHtml(tender.title)}</option>`)
          .join("")}`;
      }

      refs.table.innerHTML = state.data.contracts.length
        ? state.data.contracts
            .slice()
            .sort((a, b) => new Date(a.endDate) - new Date(b.endDate))
            .map((contract) => {
              const marginPct = computeMarginPct(contract);
              return `
                <tr>
                  <td>${escapeHtml(contract.name)}</td>
                  <td>${escapeHtml(contract.client)}</td>
                  <td>${formatCurrency(contract.totalValue)}</td>
                  <td>${formatCurrency(contract.costEstimate)}</td>
                  <td>${marginPct}%</td>
                  <td>${formatDate(contract.startDate)} - ${formatDate(contract.endDate)}</td>
                  <td>${escapeHtml(contract.manager)}</td>
                  <td>
                    <select class="contract-status-select" data-id="${contract.id}" ${can("manageContracts") ? "" : "disabled"}>
                      ${CONTRACT_STATUSES.map(
                        (status) =>
                          `<option value="${status.id}" ${status.id === contract.status ? "selected" : ""}>${escapeHtml(
                            status.label
                          )}</option>`
                      ).join("")}
                    </select>
                  </td>
                  <td>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value="${contract.progress}"
                      class="contract-progress-input"
                      data-id="${contract.id}"
                      ${can("manageContracts") ? "" : "disabled"}
                    />
                    <span class="inline-value">${contract.progress}%</span>
                  </td>
                </tr>
              `;
            })
            .join("")
        : '<tr><td colspan="9" class="muted">No hay contratos registrados.</td></tr>';
    }
  };
}

function createOperationsController() {
  const refs = {
    form: document.getElementById("operation-form"),
    contractSelect: document.getElementById("operation-contract-select"),
    board: document.getElementById("operations-board"),
    upcoming: document.getElementById("operations-upcoming")
  };

  return {
    init() {
      if (refs.form) {
        refs.form.addEventListener("submit", (event) => {
          event.preventDefault();
          if (!can("manageOperations")) {
            alert("Tu rol no puede crear tareas operativas.");
            return;
          }
          if (!state.data.contracts.length) {
            alert("Necesitas al menos un contrato para crear tareas operativas.");
            return;
          }

          const form = new FormData(event.target);
          state.data.operationTasks.push({
            id: uid(),
            contractId: String(form.get("contractId") || ""),
            title: String(form.get("title") || "").trim(),
            owner: String(form.get("owner") || "").trim(),
            priority: String(form.get("priority") || "medium"),
            dueDate: String(form.get("dueDate") || isoDate(Date.now())),
            status: String(form.get("status") || "todo"),
            createdAt: nowISO()
          });
          persist();
          event.target.reset();
          renderPage();
        });
      }

      if (refs.board) {
        refs.board.addEventListener("change", (event) => {
          const select = event.target.closest(".operation-status-select");
          if (!select) return;
          if (!can("manageOperations")) {
            alert("Tu rol no puede actualizar tareas operativas.");
            renderPage();
            return;
          }
          const task = state.data.operationTasks.find((item) => item.id === select.dataset.id);
          if (!task) return;
          task.status = select.value;
          persist();
          renderPage();
        });
      }
    },

    render() {
      if (!refs.board) return;

      if (refs.contractSelect) {
        refs.contractSelect.innerHTML = state.data.contracts.length
          ? state.data.contracts
              .map((contract) => `<option value="${contract.id}">${escapeHtml(contract.name)}</option>`)
              .join("")
          : "<option value=''>Sin contratos</option>";
        refs.contractSelect.disabled = !state.data.contracts.length;
      }

      if (refs.form) {
        disableForm(refs.form, !can("manageOperations"));
      }

      refs.board.innerHTML = OPERATION_TASK_STATUSES.map((status) => {
        const tasks = state.data.operationTasks
          .filter((task) => task.status === status.id)
          .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        return `
          <article class="ops-column">
            <header class="stage-head">
              <h3>${escapeHtml(status.label)}</h3>
              <span class="stage-count">${tasks.length}</span>
            </header>
            <div class="candidate-list">
              ${
                tasks.length
                  ? tasks.map((task) => operationTaskCard(task)).join("")
                  : '<p class="empty-state">Sin tareas</p>'
              }
            </div>
          </article>
        `;
      }).join("");

      refs.upcoming.innerHTML = state.data.operationTasks
        .filter((task) => task.status !== "done")
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
        .slice(0, 6)
        .map((task) => {
          const contract = findContract(task.contractId);
          return `<li><strong>${escapeHtml(task.title)}</strong><br />${escapeHtml(
            contract ? contract.name : "Contrato sin referencia"
          )} - vence ${formatDate(task.dueDate)}</li>`;
        })
        .join("") || '<li class="muted">No hay tareas pendientes.</li>';
    }
  };
}

function createFinanceController() {
  const refs = {
    kpis: document.getElementById("finance-kpis"),
    form: document.getElementById("finance-form"),
    contractSelect: document.getElementById("finance-contract-select"),
    table: document.getElementById("finance-table")
  };

  return {
    init() {
      if (refs.form) {
        refs.form.addEventListener("submit", (event) => {
          event.preventDefault();
          if (!can("manageFinance")) {
            alert("Tu rol no puede registrar movimientos financieros.");
            return;
          }
          if (!state.data.contracts.length) {
            alert("Necesitas al menos un contrato para registrar movimientos.");
            return;
          }

          const form = new FormData(event.target);
          state.data.financeEntries.push({
            id: uid(),
            contractId: String(form.get("contractId") || ""),
            type: String(form.get("type") || "income"),
            concept: String(form.get("concept") || "").trim(),
            category: String(form.get("category") || "").trim(),
            amount: Number(form.get("amount") || 0),
            dueDate: String(form.get("dueDate") || isoDate(Date.now())),
            status: String(form.get("status") || "pending"),
            createdAt: nowISO()
          });
          persist();
          event.target.reset();
          renderPage();
        });
      }

      if (refs.table) {
        refs.table.addEventListener("change", (event) => {
          const select = event.target.closest(".finance-status-select");
          if (!select) return;
          if (!can("manageFinance")) {
            alert("Tu rol no puede cambiar estado financiero.");
            renderPage();
            return;
          }

          const entry = state.data.financeEntries.find((item) => item.id === select.dataset.id);
          if (!entry) return;
          entry.status = select.value;
          persist();
          renderPage();
        });
      }
    },

    render() {
      if (!refs.kpis) return;

      if (refs.contractSelect) {
        refs.contractSelect.innerHTML = state.data.contracts.length
          ? state.data.contracts
              .map((contract) => `<option value="${contract.id}">${escapeHtml(contract.name)}</option>`)
              .join("")
          : "<option value=''>Sin contratos</option>";
        refs.contractSelect.disabled = !state.data.contracts.length;
      }

      if (refs.form) {
        disableForm(refs.form, !can("manageFinance"));
      }

      const metrics = getFinanceMetrics();
      refs.kpis.innerHTML = [
        kpiCard("Ingreso mes", formatCurrency(metrics.monthIncome)),
        kpiCard("Egreso mes", formatCurrency(metrics.monthExpense)),
        kpiCard("Neto mes", formatCurrency(metrics.monthNet)),
        kpiCard("Pendiente cobrar", formatCurrency(metrics.pendingReceivable)),
        kpiCard("Pendiente pagar", formatCurrency(metrics.pendingPayable))
      ].join("");

      refs.table.innerHTML = state.data.financeEntries.length
        ? state.data.financeEntries
            .slice()
            .sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate))
            .map((entry) => {
              const contract = findContract(entry.contractId);
              return `
                <tr>
                  <td>${formatDate(entry.dueDate)}</td>
                  <td>${escapeHtml(contract ? contract.name : "Sin contrato")}</td>
                  <td><span class="badge ${entry.type === "income" ? "badge-success" : "badge-danger"}">${
                entry.type === "income" ? "Ingreso" : "Egreso"
              }</span></td>
                  <td>${escapeHtml(entry.concept)}</td>
                  <td>${escapeHtml(entry.category)}</td>
                  <td>${formatCurrency(entry.amount)}</td>
                  <td>
                    <select class="finance-status-select" data-id="${entry.id}" ${can("manageFinance") ? "" : "disabled"}>
                      <option value="pending" ${entry.status === "pending" ? "selected" : ""}>Pendiente</option>
                      <option value="paid" ${entry.status === "paid" ? "selected" : ""}>Pagado</option>
                    </select>
                  </td>
                </tr>
              `;
            })
            .join("")
        : '<tr><td colspan="7" class="muted">No hay movimientos financieros.</td></tr>';
    }
  };
}
function createHrController() {
  const refs = {
    kpis: document.getElementById("hr-kpis"),
    vacancyForm: document.getElementById("vacancy-form"),
    candidateForm: document.getElementById("candidate-form"),
    vacancyContractSelect: document.getElementById("vacancy-contract-select"),
    candidateVacancySelect: document.getElementById("candidate-vacancy-select"),
    vacanciesTable: document.getElementById("vacancies-table"),
    pipeline: document.getElementById("hr-pipeline")
  };

  return {
    init() {
      if (refs.vacancyForm) {
        refs.vacancyForm.addEventListener("submit", (event) => {
          event.preventDefault();
          if (!can("manageHr")) {
            alert("Tu rol no puede crear vacantes.");
            return;
          }

          const form = new FormData(event.target);
          state.data.vacancies.push({
            id: uid(),
            title: String(form.get("title") || "").trim(),
            area: String(form.get("area") || "").trim(),
            contractId: String(form.get("contractId") || "") || null,
            openings: Number(form.get("openings") || 1),
            targetDate: String(form.get("targetDate") || "") || null,
            status: String(form.get("status") || "open"),
            createdAt: nowISO()
          });
          persist();
          event.target.reset();
          renderPage();
        });
      }

      if (refs.candidateForm) {
        refs.candidateForm.addEventListener("submit", (event) => {
          event.preventDefault();
          if (!can("manageHr")) {
            alert("Tu rol no puede crear candidatos.");
            return;
          }
          if (!state.data.vacancies.length) {
            alert("Debes crear una vacante antes de cargar candidatos.");
            return;
          }

          const form = new FormData(event.target);
          state.data.candidates.push({
            id: uid(),
            vacancyId: String(form.get("vacancyId") || ""),
            name: String(form.get("name") || "").trim(),
            source: String(form.get("source") || "Otro"),
            salary: Number(form.get("salary") || 0),
            stage: "intake",
            createdAt: nowISO(),
            updatedAt: nowISO(),
            hiredAt: null
          });
          persist();
          event.target.reset();
          renderPage();
        });
      }

      if (refs.vacanciesTable) {
        refs.vacanciesTable.addEventListener("change", (event) => {
          const select = event.target.closest(".vacancy-status-select");
          if (!select) return;
          if (!can("manageHr")) {
            alert("Tu rol no puede actualizar vacantes.");
            renderPage();
            return;
          }
          const vacancy = state.data.vacancies.find((item) => item.id === select.dataset.id);
          if (!vacancy) return;
          vacancy.status = select.value;
          persist();
          renderPage();
        });
      }

      if (refs.pipeline) {
        refs.pipeline.addEventListener("change", (event) => {
          const select = event.target.closest(".candidate-stage-select");
          if (!select) return;
          if (!can("manageHr")) {
            alert("Tu rol no puede actualizar etapas de candidatos.");
            renderPage();
            return;
          }
          const candidate = state.data.candidates.find((item) => item.id === select.dataset.id);
          if (!candidate) return;
          candidate.stage = select.value;
          candidate.updatedAt = nowISO();
          candidate.hiredAt = candidate.stage === "hired" ? nowISO() : null;
          persist();
          renderPage();
        });
      }
    },

    render() {
      if (!refs.kpis) return;

      const openVacancies = state.data.vacancies.filter((item) => item.status === "open").length;
      const activeCandidates = state.data.candidates.filter((item) => !TERMINAL_CANDIDATE_STAGES.has(item.stage)).length;
      const hired = state.data.candidates.filter((item) => item.stage === "hired").length;
      const avgHireDays = getAverageHireDays();

      refs.kpis.innerHTML = [
        kpiCard("Vacantes abiertas", openVacancies),
        kpiCard("Candidatos activos", activeCandidates),
        kpiCard("Contratados", hired),
        kpiCard("Tiempo promedio contratacion", `${avgHireDays} dias`)
      ].join("");

      if (refs.vacancyContractSelect) {
        refs.vacancyContractSelect.innerHTML = `<option value="">Sin contrato</option>${state.data.contracts
          .map((contract) => `<option value="${contract.id}">${escapeHtml(contract.name)}</option>`)
          .join("")}`;
      }

      if (refs.candidateVacancySelect) {
        refs.candidateVacancySelect.innerHTML = state.data.vacancies.length
          ? state.data.vacancies
              .map((vacancy) => `<option value="${vacancy.id}">${escapeHtml(vacancy.title)}</option>`)
              .join("")
          : "<option value=''>Sin vacantes</option>";
        refs.candidateVacancySelect.disabled = !state.data.vacancies.length;
      }

      if (refs.vacancyForm) {
        disableForm(refs.vacancyForm, !can("manageHr"));
      }
      if (refs.candidateForm) {
        disableForm(refs.candidateForm, !can("manageHr"));
      }

      refs.vacanciesTable.innerHTML = state.data.vacancies.length
        ? state.data.vacancies
            .slice()
            .sort((a, b) => {
              const ta = a.targetDate ? new Date(a.targetDate).getTime() : Number.MAX_SAFE_INTEGER;
              const tb = b.targetDate ? new Date(b.targetDate).getTime() : Number.MAX_SAFE_INTEGER;
              return ta - tb;
            })
            .map((vacancy) => {
              const contract = findContract(vacancy.contractId);
              const candidateCount = state.data.candidates.filter((candidate) => candidate.vacancyId === vacancy.id).length;
              return `
                <tr>
                  <td>${escapeHtml(vacancy.title)}</td>
                  <td>${escapeHtml(vacancy.area)}</td>
                  <td>${escapeHtml(contract ? contract.name : "Sin contrato")}</td>
                  <td>${vacancy.openings}</td>
                  <td>${candidateCount}</td>
                  <td>
                    <select class="vacancy-status-select" data-id="${vacancy.id}" ${can("manageHr") ? "" : "disabled"}>
                      ${VACANCY_STATUSES.map(
                        (status) =>
                          `<option value="${status.id}" ${status.id === vacancy.status ? "selected" : ""}>${escapeHtml(
                            status.label
                          )}</option>`
                      ).join("")}
                    </select>
                  </td>
                  <td>${vacancy.targetDate ? formatDate(vacancy.targetDate) : "-"}</td>
                </tr>
              `;
            })
            .join("")
        : '<tr><td colspan="7" class="muted">No hay vacantes registradas.</td></tr>';

      refs.pipeline.innerHTML = CANDIDATE_STAGES.map((stage) => {
        const candidates = state.data.candidates.filter((candidate) => candidate.stage === stage.id);
        return `
          <article class="stage-column">
            <header class="stage-head">
              <h3>${escapeHtml(stage.label)}</h3>
              <span class="stage-count">${candidates.length}</span>
            </header>
            <div class="candidate-list">
              ${
                candidates.length
                  ? candidates
                      .map((candidate) => {
                        const vacancy = findVacancy(candidate.vacancyId);
                        return `
                          <article class="candidate-card">
                            <strong>${escapeHtml(candidate.name)}</strong>
                            <p>Vacante: ${escapeHtml(vacancy ? vacancy.title : "Sin vacante")}</p>
                            <p>Fuente: ${escapeHtml(candidate.source)}</p>
                            <p>Pretension: ${formatCurrency(candidate.salary)}</p>
                            <label class="control compact">
                              Etapa
                              <select class="candidate-stage-select" data-id="${candidate.id}" ${can("manageHr") ? "" : "disabled"}>
                                ${CANDIDATE_STAGES.map(
                                  (item) =>
                                    `<option value="${item.id}" ${item.id === candidate.stage ? "selected" : ""}>${escapeHtml(
                                      item.label
                                    )}</option>`
                                ).join("")}
                              </select>
                            </label>
                          </article>
                        `;
                      })
                      .join("")
                  : '<p class="empty-state">Sin candidatos</p>'
              }
            </div>
          </article>
        `;
      }).join("");
    }
  };
}

function createHrPeopleController() {
  const refs = {
    kpis: document.getElementById("hr-people-kpis"),
    personForm: document.getElementById("person-form"),
    docForm: document.getElementById("person-doc-form"),
    personContractSelect: document.getElementById("person-contract-select"),
    docPersonSelect: document.getElementById("doc-person-select"),
    peopleTable: document.getElementById("people-table"),
    docsTable: document.getElementById("person-docs-table")
  };

  return {
    init() {
      if (refs.personForm) {
        refs.personForm.addEventListener("submit", (event) => {
          event.preventDefault();
          if (!can("manageHr")) {
            alert("Tu rol no puede crear fichas de personas.");
            return;
          }

          const form = new FormData(event.target);
          state.data.peopleRecords.push({
            id: uid(),
            fullName: String(form.get("fullName") || "").trim(),
            idNumber: String(form.get("idNumber") || "").trim(),
            position: String(form.get("position") || "").trim(),
            contractId: String(form.get("contractId") || "") || null,
            hireDate: String(form.get("hireDate") || isoDate(Date.now())),
            employmentStatus: String(form.get("employmentStatus") || "active"),
            createdAt: nowISO()
          });
          persist();
          event.target.reset();
          renderPage();
        });
      }

      if (refs.docForm) {
        refs.docForm.addEventListener("submit", (event) => {
          event.preventDefault();
          if (!can("manageHr")) {
            alert("Tu rol no puede cargar documentos.");
            return;
          }
          if (!state.data.peopleRecords.length) {
            alert("Primero debes crear una ficha de persona.");
            return;
          }

          const form = new FormData(event.target);
          state.data.personDocuments.push({
            id: uid(),
            personId: String(form.get("personId") || ""),
            docType: String(form.get("docType") || "Contrato"),
            fileName: String(form.get("fileName") || "").trim(),
            status: String(form.get("status") || "uploaded"),
            expiryDate: String(form.get("expiryDate") || "") || null,
            updatedAt: nowISO(),
            createdAt: nowISO()
          });
          persist();
          event.target.reset();
          renderPage();
        });
      }

      if (refs.peopleTable) {
        refs.peopleTable.addEventListener("change", (event) => {
          const select = event.target.closest(".person-status-select");
          if (!select) return;
          if (!can("manageHr")) {
            alert("Tu rol no puede cambiar estado laboral.");
            renderPage();
            return;
          }

          const person = state.data.peopleRecords.find((item) => item.id === select.dataset.id);
          if (!person) return;
          person.employmentStatus = select.value;
          persist();
          renderPage();
        });
      }

      if (refs.docsTable) {
        refs.docsTable.addEventListener("change", (event) => {
          const select = event.target.closest(".doc-status-select");
          if (!select) return;
          if (!can("manageHr")) {
            alert("Tu rol no puede cambiar estado documental.");
            renderPage();
            return;
          }

          const doc = state.data.personDocuments.find((item) => item.id === select.dataset.id);
          if (!doc) return;
          doc.status = select.value;
          doc.updatedAt = nowISO();
          persist();
          renderPage();
        });
      }
    },

    render() {
      if (!refs.kpis) return;

      if (refs.personContractSelect) {
        refs.personContractSelect.innerHTML = `<option value="">Sin contrato</option>${state.data.contracts
          .map((contract) => `<option value="${contract.id}">${escapeHtml(contract.name)}</option>`)
          .join("")}`;
      }

      if (refs.docPersonSelect) {
        refs.docPersonSelect.innerHTML = state.data.peopleRecords.length
          ? state.data.peopleRecords
              .map((person) => `<option value="${person.id}">${escapeHtml(person.fullName)}</option>`)
              .join("")
          : "<option value=''>Sin personas</option>";
        refs.docPersonSelect.disabled = !state.data.peopleRecords.length;
      }

      if (refs.personForm) {
        disableForm(refs.personForm, !can("manageHr"));
      }
      if (refs.docForm) {
        const disableDocForm = !can("manageHr") || !state.data.peopleRecords.length;
        disableForm(refs.docForm, disableDocForm);
      }

      const metrics = getPeopleDocumentMetrics();
      const activePeople = state.data.peopleRecords.filter((person) => person.employmentStatus === "active").length;

      refs.kpis.innerHTML = [
        kpiCard("Personas totales", state.data.peopleRecords.length),
        kpiCard("Personas activas", activePeople),
        kpiCard("Documentos cargados", metrics.uploaded),
        kpiCard("Documentos pendientes", metrics.pending),
        kpiCard("Documentos vencidos", metrics.expired),
        kpiCard("Cumplimiento requerido", `${metrics.complianceRate}%`)
      ].join("");

      refs.peopleTable.innerHTML = state.data.peopleRecords.length
        ? state.data.peopleRecords
            .slice()
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map((person) => {
              const contract = findContract(person.contractId);
              const personDocs = state.data.personDocuments.filter((doc) => doc.personId === person.id);
              const compliance = getPersonCompliance(personDocs);
              return `
                <tr>
                  <td>${escapeHtml(person.fullName)}</td>
                  <td>${escapeHtml(person.idNumber)}</td>
                  <td>${escapeHtml(person.position)}</td>
                  <td>${escapeHtml(contract ? contract.name : "Sin contrato")}</td>
                  <td>${formatDate(person.hireDate)}</td>
                  <td>
                    <select class="person-status-select" data-id="${person.id}" ${can("manageHr") ? "" : "disabled"}>
                      ${EMPLOYMENT_STATUSES.map(
                        (status) =>
                          `<option value="${status.id}" ${status.id === person.employmentStatus ? "selected" : ""}>${escapeHtml(
                            status.label
                          )}</option>`
                      ).join("")}
                    </select>
                  </td>
                  <td>${compliance.loaded}/${compliance.required} requeridos</td>
                </tr>
              `;
            })
            .join("")
        : '<tr><td colspan="7" class="muted">Sin fichas de personas.</td></tr>';

      refs.docsTable.innerHTML = state.data.personDocuments.length
        ? state.data.personDocuments
            .slice()
            .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
            .map((doc) => {
              const person = findPerson(doc.personId);
              return `
                <tr>
                  <td>${escapeHtml(person ? person.fullName : "Persona no encontrada")}</td>
                  <td>${escapeHtml(doc.docType)}</td>
                  <td>${escapeHtml(doc.fileName || "-")}</td>
                  <td>
                    <select class="doc-status-select" data-id="${doc.id}" ${can("manageHr") ? "" : "disabled"}>
                      ${PERSON_DOC_STATUSES.map(
                        (status) =>
                          `<option value="${status.id}" ${status.id === doc.status ? "selected" : ""}>${escapeHtml(
                            status.label
                          )}</option>`
                      ).join("")}
                    </select>
                  </td>
                  <td>${doc.expiryDate ? formatDate(doc.expiryDate) : "-"}</td>
                  <td>${formatDate(doc.updatedAt || doc.createdAt)}</td>
                </tr>
              `;
            })
            .join("")
        : '<tr><td colspan="6" class="muted">Sin documentos cargados.</td></tr>';
    }
  };
}

function createArchitectureController() {
  const refs = {
    currentModel: document.getElementById("current-model"),
    readiness: document.getElementById("firebase-readiness")
  };

  return {
    init() {},
    render() {
      if (!refs.currentModel || !refs.readiness) return;

      refs.currentModel.innerHTML = [
        `Licitaciones cargadas: ${state.data.tenders.length}`,
        `Contratos cargados: ${state.data.contracts.length}`,
        `Tareas operativas: ${state.data.operationTasks.length}`,
        `Movimientos financieros: ${state.data.financeEntries.length}`,
        `Vacantes RRHH: ${state.data.vacancies.length}`,
        `Candidatos RRHH: ${state.data.candidates.length}`,
        `Personas RRHH: ${state.data.peopleRecords.length}`,
        `Documentos RRHH: ${state.data.personDocuments.length}`
      ]
        .map((row) => `<li>${escapeHtml(row)}</li>`)
        .join("");

      const readinessItems = buildFirebaseReadiness();
      refs.readiness.innerHTML = readinessItems
        .map((item) => {
          const badgeClass = item.status === "ok" ? "badge-success" : item.status === "warn" ? "badge-warning" : "badge-danger";
          const badgeLabel = item.status === "ok" ? "OK" : item.status === "warn" ? "Pendiente" : "Critico";
          return `<li><span class="badge ${badgeClass}">${badgeLabel}</span> ${escapeHtml(item.text)}</li>`;
        })
        .join("");
    }
  };
}

function getDashboardMetrics() {
  const openTenders = state.data.tenders.filter((item) => item.status === "draft" || item.status === "submitted").length;
  const decided = state.data.tenders.filter((item) => item.status === "won" || item.status === "lost");
  const won = decided.filter((item) => item.status === "won").length;
  const winRate = decided.length ? Number(((won / decided.length) * 100).toFixed(1)) : 0;

  const activeContracts = state.data.contracts.filter((item) => item.status === "active" || item.status === "at_risk").length;
  const riskContracts = state.data.contracts.filter((item) => item.status === "at_risk").length;

  const blockedTasks = state.data.operationTasks.filter((item) => item.status === "blocked").length;

  const financeMetrics = getFinanceMetrics();

  const openVacancies = state.data.vacancies.filter((item) => item.status === "open").length;
  const activeCandidates = state.data.candidates.filter((item) => !TERMINAL_CANDIDATE_STAGES.has(item.stage)).length;
  const peopleDocs = getPeopleDocumentMetrics();

  return {
    openTenders,
    winRate,
    activeContracts,
    riskContracts,
    blockedTasks,
    cashBalance: financeMetrics.cashBalance,
    pendingReceivable: financeMetrics.pendingReceivable,
    monthNetFlow: financeMetrics.monthNet,
    openVacancies,
    activeCandidates,
    docsPending: peopleDocs.pending,
    docsExpired: peopleDocs.expired
  };
}

function getFinanceMetrics() {
  const now = new Date();
  const monthEntries = state.data.financeEntries.filter((entry) => {
    const due = new Date(entry.dueDate);
    return due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear();
  });

  const monthIncome = monthEntries.filter((entry) => entry.type === "income").reduce((acc, entry) => acc + entry.amount, 0);
  const monthExpense = monthEntries.filter((entry) => entry.type === "expense").reduce((acc, entry) => acc + entry.amount, 0);
  const monthNet = monthIncome - monthExpense;

  const pendingReceivable = state.data.financeEntries
    .filter((entry) => entry.type === "income" && entry.status === "pending")
    .reduce((acc, entry) => acc + entry.amount, 0);

  const pendingPayable = state.data.financeEntries
    .filter((entry) => entry.type === "expense" && entry.status === "pending")
    .reduce((acc, entry) => acc + entry.amount, 0);

  const cashBalance = state.data.financeEntries
    .filter((entry) => entry.status === "paid")
    .reduce((acc, entry) => acc + (entry.type === "income" ? entry.amount : -entry.amount), 0);

  return {
    monthIncome,
    monthExpense,
    monthNet,
    pendingReceivable,
    pendingPayable,
    cashBalance
  };
}

function getUpcomingMilestones() {
  const items = [];

  state.data.tenders.forEach((tender) => {
    if (tender.status === "draft" || tender.status === "submitted") {
      items.push({
        module: "Licitacion",
        title: `${tender.title} (cierre)`,
        date: tender.closeDate
      });
    }
  });

  state.data.contracts.forEach((contract) => {
    if (contract.status === "active" || contract.status === "at_risk") {
      items.push({
        module: "Contrato",
        title: `${contract.name} (termino)`,
        date: contract.endDate
      });
    }
  });

  state.data.operationTasks.forEach((task) => {
    if (task.status !== "done") {
      items.push({
        module: "Operacion",
        title: task.title,
        date: task.dueDate
      });
    }
  });

  state.data.financeEntries.forEach((entry) => {
    if (entry.status === "pending") {
      items.push({
        module: "Finanzas",
        title: `${entry.concept} (${entry.type === "income" ? "cobro" : "pago"})`,
        date: entry.dueDate
      });
    }
  });

  return items
    .filter((item) => !Number.isNaN(new Date(item.date).getTime()))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function buildDashboardAlerts(metrics) {
  const alerts = [];
  if (metrics.riskContracts > 0) {
    alerts.push(`${metrics.riskContracts} contrato(s) en estado de riesgo.`);
  }
  if (metrics.blockedTasks > 0) {
    alerts.push(`${metrics.blockedTasks} tarea(s) bloqueada(s) en operaciones.`);
  }
  if (metrics.pendingReceivable > 10000) {
    alerts.push(`Pendiente por cobrar superior a USD 10.000.`);
  }
  if (metrics.monthNetFlow < 0) {
    alerts.push(`Flujo mensual negativo. Revisar desviacion de costos.`);
  }
  if (metrics.openTenders === 0) {
    alerts.push("No hay pipeline de licitaciones activas.");
  }
  if (metrics.docsExpired > 0) {
    alerts.push(`${metrics.docsExpired} documento(s) vencido(s) en RRHH Personas.`);
  }
  if (metrics.docsPending > 0) {
    alerts.push(`${metrics.docsPending} documento(s) pendiente(s) de carga en RRHH Personas.`);
  }
  return alerts;
}

function buildFirebaseReadiness() {
  const hasLinkedContracts = state.data.contracts.some((contract) => !!contract.tenderId);
  const hasOpsLinked = state.data.operationTasks.every((task) => !!task.contractId);
  const hasFinanceLinked = state.data.financeEntries.every((entry) => !!entry.contractId);
  const hasPeopleDocsLinked =
    state.data.personDocuments.length === 0 ||
    state.data.personDocuments.every((documentItem) => !!documentItem.personId && !!findPerson(documentItem.personId));

  return [
    {
      status: "ok",
      text: "Modelo por modulo definido y con IDs unicos para cada entidad."
    },
    {
      status: hasLinkedContracts ? "ok" : "warn",
      text: "Contratos vinculados a licitaciones adjudicadas."
    },
    {
      status: hasOpsLinked ? "ok" : "warn",
      text: "Operacion vinculada a contratos para trazabilidad." 
    },
    {
      status: hasFinanceLinked ? "ok" : "warn",
      text: "Movimientos financieros vinculados a contratos."
    },
    {
      status: hasPeopleDocsLinked ? "ok" : "warn",
      text: "Documentos de RRHH vinculados a fichas de personas."
    },
    {
      status: can("resetDemo") ? "ok" : "warn",
      text: "Control de acciones por rol ya presente en frontend (pendiente reforzar en backend)."
    },
    {
      status: "warn",
      text: "Pendiente: capa repository para cambiar localStorage por Firestore sin tocar UI."
    }
  ];
}

function operationTaskCard(task) {
  const contract = findContract(task.contractId);
  const priorityClass = task.priority === "high" ? "badge-danger" : task.priority === "medium" ? "badge-warning" : "badge-success";
  const priorityLabel = task.priority === "high" ? "Alta" : task.priority === "medium" ? "Media" : "Baja";

  return `
    <article class="candidate-card">
      <strong>${escapeHtml(task.title)}</strong>
      <p>Contrato: ${escapeHtml(contract ? contract.name : "Sin contrato")}</p>
      <p>Owner: ${escapeHtml(task.owner)}</p>
      <p>Vence: ${formatDate(task.dueDate)}</p>
      <p><span class="badge ${priorityClass}">${priorityLabel}</span></p>
      <label class="control compact">
        Estado
        <select class="operation-status-select" data-id="${task.id}" ${can("manageOperations") ? "" : "disabled"}>
          ${OPERATION_TASK_STATUSES.map(
            (status) =>
              `<option value="${status.id}" ${status.id === task.status ? "selected" : ""}>${escapeHtml(status.label)}</option>`
          ).join("")}
        </select>
      </label>
    </article>
  `;
}

function countByStatus(items, statuses) {
  return statuses.reduce((acc, status) => {
    acc[status.id] = items.filter((item) => item.status === status.id).length;
    return acc;
  }, {});
}

function can(permission) {
  return ROLES[state.activeRole] && ROLES[state.activeRole].permissions.includes(permission);
}

function findContract(contractId) {
  if (!contractId) return null;
  return state.data.contracts.find((item) => item.id === contractId) || null;
}

function findPerson(personId) {
  if (!personId) return null;
  return state.data.peopleRecords.find((item) => item.id === personId) || null;
}

function findVacancy(vacancyId) {
  if (!vacancyId) return null;
  return state.data.vacancies.find((item) => item.id === vacancyId) || null;
}

function getPersonCompliance(personDocs) {
  const loaded = REQUIRED_PERSON_DOC_TYPES.filter((requiredDocType) =>
    personDocs.some((doc) => doc.docType === requiredDocType && (doc.status === "uploaded" || doc.status === "expiring"))
  ).length;
  return {
    loaded,
    required: REQUIRED_PERSON_DOC_TYPES.length
  };
}

function getPeopleDocumentMetrics() {
  const uploaded = state.data.personDocuments.filter((doc) => doc.status === "uploaded" || doc.status === "expiring").length;
  const pending = state.data.personDocuments.filter((doc) => doc.status === "pending").length;
  const expired = state.data.personDocuments.filter((doc) => doc.status === "expired").length;

  const requiredTotal = state.data.peopleRecords.length * REQUIRED_PERSON_DOC_TYPES.length;
  const requiredLoaded = state.data.peopleRecords.reduce((acc, person) => {
    const docs = state.data.personDocuments.filter((doc) => doc.personId === person.id);
    return acc + getPersonCompliance(docs).loaded;
  }, 0);
  const complianceRate = requiredTotal ? ((requiredLoaded / requiredTotal) * 100).toFixed(1) : "100.0";

  return {
    uploaded,
    pending,
    expired,
    complianceRate
  };
}

function computeMarginPct(contract) {
  if (!contract.totalValue) return 0;
  const margin = contract.totalValue - contract.costEstimate;
  return ((margin / contract.totalValue) * 100).toFixed(1);
}

function getAverageHireDays() {
  const hired = state.data.candidates.filter((candidate) => candidate.stage === "hired" && candidate.hiredAt);
  if (!hired.length) return 0;
  const total = hired.reduce((acc, candidate) => acc + daysDiff(candidate.createdAt, candidate.hiredAt), 0);
  return Math.round(total / hired.length);
}

function disableForm(formNode, disabled) {
  formNode.querySelectorAll("input, select, button, textarea").forEach((field) => {
    field.disabled = disabled;
  });
}

function loadRole() {
  const stored = localStorage.getItem(ROLE_KEY);
  return stored && ROLES[stored] ? stored : "admin";
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
    if (
      parsed.schemaVersion !== SCHEMA_VERSION ||
      !Array.isArray(parsed.tenders) ||
      !Array.isArray(parsed.contracts) ||
      !Array.isArray(parsed.operationTasks) ||
      !Array.isArray(parsed.financeEntries) ||
      !Array.isArray(parsed.vacancies) ||
      !Array.isArray(parsed.candidates) ||
      !Array.isArray(parsed.peopleRecords) ||
      !Array.isArray(parsed.personDocuments)
    ) {
      throw new Error("Schema mismatch");
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

  const tenderA = {
    id: uid(),
    title: "Mantencion electrica zonas industriales",
    client: "Empresa Minera Andina",
    amount: 180000,
    closeDate: isoDate(now + 12 * 24 * 60 * 60 * 1000),
    probability: 65,
    responsible: "Carolina Mena",
    status: "submitted",
    createdAt: nowISO()
  };

  const tenderB = {
    id: uid(),
    title: "Servicio de inspeccion mecanica anual",
    client: "Puerto Sur",
    amount: 125000,
    closeDate: isoDate(now - 25 * 24 * 60 * 60 * 1000),
    probability: 100,
    responsible: "Carolina Mena",
    status: "won",
    createdAt: nowISO()
  };

  const tenderC = {
    id: uid(),
    title: "Operacion de cuadrillas viales",
    client: "Municipalidad San Rafael",
    amount: 95000,
    closeDate: isoDate(now + 28 * 24 * 60 * 60 * 1000),
    probability: 45,
    responsible: "Luis Paredes",
    status: "draft",
    createdAt: nowISO()
  };

  const tenderD = {
    id: uid(),
    title: "Mantencion faena zona norte",
    client: "Constructora Delta",
    amount: 110000,
    closeDate: isoDate(now - 40 * 24 * 60 * 60 * 1000),
    probability: 100,
    responsible: "Luis Paredes",
    status: "lost",
    createdAt: nowISO()
  };

  const contractA = {
    id: uid(),
    tenderId: tenderB.id,
    name: "Contrato Puerto Sur 2026",
    client: "Puerto Sur",
    totalValue: 125000,
    costEstimate: 93000,
    startDate: isoDate(now - 20 * 24 * 60 * 60 * 1000),
    endDate: isoDate(now + 150 * 24 * 60 * 60 * 1000),
    manager: "Daniel Loyola",
    status: "active",
    progress: 38,
    createdAt: nowISO()
  };

  const contractB = {
    id: uid(),
    tenderId: null,
    name: "Soporte operativo planta central",
    client: "Energia Verde SpA",
    totalValue: 86000,
    costEstimate: 71000,
    startDate: isoDate(now - 50 * 24 * 60 * 60 * 1000),
    endDate: isoDate(now + 40 * 24 * 60 * 60 * 1000),
    manager: "Antonia Cruz",
    status: "at_risk",
    progress: 67,
    createdAt: nowISO()
  };

  const vacancyA = {
    id: uid(),
    title: "Supervisor de mantenimiento",
    area: "Operaciones",
    contractId: contractA.id,
    openings: 1,
    targetDate: isoDate(now + 18 * 24 * 60 * 60 * 1000),
    status: "open",
    createdAt: nowISO()
  };

  const vacancyB = {
    id: uid(),
    title: "Tecnico mecanico",
    area: "Terreno",
    contractId: contractB.id,
    openings: 2,
    targetDate: isoDate(now + 9 * 24 * 60 * 60 * 1000),
    status: "open",
    createdAt: nowISO()
  };

  const personA = {
    id: uid(),
    fullName: "Pilar Caceres",
    idNumber: "18.334.223-9",
    position: "Tecnica mecanica",
    contractId: contractB.id,
    hireDate: isoDate(now - 90 * 24 * 60 * 60 * 1000),
    employmentStatus: "active",
    createdAt: nowISO()
  };

  const personB = {
    id: uid(),
    fullName: "Sergio Olguin",
    idNumber: "16.912.001-2",
    position: "Supervisor de mantenimiento",
    contractId: contractA.id,
    hireDate: isoDate(now - 140 * 24 * 60 * 60 * 1000),
    employmentStatus: "active",
    createdAt: nowISO()
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    tenders: [tenderA, tenderB, tenderC, tenderD],
    contracts: [contractA, contractB],
    operationTasks: [
      {
        id: uid(),
        contractId: contractA.id,
        title: "Aprobar plan de seguridad mensual",
        owner: "Daniel Loyola",
        priority: "high",
        dueDate: isoDate(now + 2 * 24 * 60 * 60 * 1000),
        status: "doing",
        createdAt: nowISO()
      },
      {
        id: uid(),
        contractId: contractB.id,
        title: "Liberar compra de repuestos criticos",
        owner: "Antonia Cruz",
        priority: "high",
        dueDate: isoDate(now + 1 * 24 * 60 * 60 * 1000),
        status: "blocked",
        createdAt: nowISO()
      },
      {
        id: uid(),
        contractId: contractB.id,
        title: "Actualizar cronograma de cuadrillas",
        owner: "Mauricio Rios",
        priority: "medium",
        dueDate: isoDate(now + 5 * 24 * 60 * 60 * 1000),
        status: "todo",
        createdAt: nowISO()
      },
      {
        id: uid(),
        contractId: contractA.id,
        title: "Cierre de acta hito 1",
        owner: "Daniel Loyola",
        priority: "low",
        dueDate: isoDate(now - 4 * 24 * 60 * 60 * 1000),
        status: "done",
        createdAt: nowISO()
      }
    ],
    financeEntries: [
      {
        id: uid(),
        contractId: contractA.id,
        type: "income",
        concept: "Estado de pago hito 1",
        category: "Facturacion",
        amount: 42000,
        dueDate: isoDate(now - 10 * 24 * 60 * 60 * 1000),
        status: "paid",
        createdAt: nowISO()
      },
      {
        id: uid(),
        contractId: contractA.id,
        type: "expense",
        concept: "Compra materiales electricos",
        category: "Materiales",
        amount: 15000,
        dueDate: isoDate(now - 8 * 24 * 60 * 60 * 1000),
        status: "paid",
        createdAt: nowISO()
      },
      {
        id: uid(),
        contractId: contractB.id,
        type: "income",
        concept: "Cobro mensual servicio",
        category: "Facturacion",
        amount: 22000,
        dueDate: isoDate(now + 6 * 24 * 60 * 60 * 1000),
        status: "pending",
        createdAt: nowISO()
      },
      {
        id: uid(),
        contractId: contractB.id,
        type: "expense",
        concept: "Subarriendo maquinaria",
        category: "Equipos",
        amount: 9000,
        dueDate: isoDate(now + 3 * 24 * 60 * 60 * 1000),
        status: "pending",
        createdAt: nowISO()
      }
    ],
    vacancies: [vacancyA, vacancyB],
    candidates: [
      {
        id: uid(),
        vacancyId: vacancyA.id,
        name: "Valentina Araya",
        source: "LinkedIn",
        salary: 2100,
        stage: "interview",
        createdAt: new Date(now - 12 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
        hiredAt: null
      },
      {
        id: uid(),
        vacancyId: vacancyB.id,
        name: "Sergio Olguin",
        source: "Referido",
        salary: 1700,
        stage: "offer",
        createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
        hiredAt: null
      },
      {
        id: uid(),
        vacancyId: vacancyB.id,
        name: "Pilar Caceres",
        source: "Portal",
        salary: 1650,
        stage: "hired",
        createdAt: new Date(now - 19 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
        hiredAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
      }
    ],
    peopleRecords: [personA, personB],
    personDocuments: [
      {
        id: uid(),
        personId: personA.id,
        docType: "Contrato",
        fileName: "contrato_pilar_caceres.pdf",
        status: "uploaded",
        expiryDate: null,
        updatedAt: nowISO(),
        createdAt: nowISO()
      },
      {
        id: uid(),
        personId: personA.id,
        docType: "Carnet",
        fileName: "carnet_pilar_caceres.pdf",
        status: "uploaded",
        expiryDate: isoDate(now + 120 * 24 * 60 * 60 * 1000),
        updatedAt: nowISO(),
        createdAt: nowISO()
      },
      {
        id: uid(),
        personId: personB.id,
        docType: "Contrato",
        fileName: "contrato_sergio_olguin.pdf",
        status: "uploaded",
        expiryDate: null,
        updatedAt: nowISO(),
        createdAt: nowISO()
      },
      {
        id: uid(),
        personId: personB.id,
        docType: "Carnet",
        fileName: "carnet_sergio_olguin.pdf",
        status: "expiring",
        expiryDate: isoDate(now + 15 * 24 * 60 * 60 * 1000),
        updatedAt: nowISO(),
        createdAt: nowISO()
      },
      {
        id: uid(),
        personId: personB.id,
        docType: "Certificado Salud",
        fileName: "certificado_salud_sergio.pdf",
        status: "pending",
        expiryDate: null,
        updatedAt: nowISO(),
        createdAt: nowISO()
      }
    ]
  };
}

function kpiCard(label, value) {
  return `
    <article class="kpi">
      <p>${escapeHtml(label)}</p>
      <strong>${escapeHtml(String(value))}</strong>
    </article>
  `;
}

function moduleHealthCard(moduleName, detail, stateClass) {
  return `
    <article class="health-card health-${stateClass}">
      <p>${escapeHtml(moduleName)}</p>
      <strong>${escapeHtml(detail)}</strong>
    </article>
  `;
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

function daysDiff(startLike, endLike) {
  const start = new Date(startLike).getTime();
  const end = new Date(endLike).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

function formatDate(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(date);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
