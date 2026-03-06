import { listEntities } from "@/server/repositories/firestore-repository";
import type { DashboardKpis } from "@/types/domain";

export async function computeDashboardKpis(tenantId: string): Promise<DashboardKpis> {
  const [tenders, contracts, operations, finance, vacancies, candidates, personDocuments] = await Promise.all([
    listEntities(tenantId, "tenders"),
    listEntities(tenantId, "contracts"),
    listEntities(tenantId, "operationTasks"),
    listEntities(tenantId, "financeEntries"),
    listEntities(tenantId, "vacancies"),
    listEntities(tenantId, "candidates"),
    listEntities(tenantId, "personDocuments")
  ]);

  const now = new Date();
  const monthFinance = finance.filter((entry) => {
    const date = new Date(entry.dueDate);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const monthIncome = monthFinance.filter((entry) => entry.type === "income").reduce((acc, item) => acc + item.amount, 0);
  const monthExpense = monthFinance.filter((entry) => entry.type === "expense").reduce((acc, item) => acc + item.amount, 0);

  return {
    openTenders: tenders.filter((item) => item.status === "draft" || item.status === "submitted").length,
    activeContracts: contracts.filter((item) => item.status === "active" || item.status === "at_risk").length,
    riskContracts: contracts.filter((item) => item.status === "at_risk").length,
    blockedTasks: operations.filter((item) => item.status === "blocked").length,
    monthNetFlow: monthIncome - monthExpense,
    openVacancies: vacancies.filter((item) => item.status === "open").length,
    activeCandidates: candidates.filter((item) => item.stage !== "hired" && item.stage !== "rejected").length,
    expiredDocuments: personDocuments.filter((item) => item.status === "expired").length
  };
}