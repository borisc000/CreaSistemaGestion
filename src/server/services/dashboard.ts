import { getEnabledModules } from "@/modules/registry";
import { listEntities } from "@/server/repositories/firestore-repository";
import type { CollectionKey } from "@/types/collections";
import type { DashboardKpis } from "@/types/domain";

function uniqueCollectionsForDashboard(): CollectionKey[] {
  const collectionSet = new Set<CollectionKey>();
  for (const moduleDefinition of getEnabledModules()) {
    if (!moduleDefinition.dashboardContributors?.length) {
      continue;
    }
    for (const collectionKey of moduleDefinition.collectionKeys) {
      collectionSet.add(collectionKey);
    }
  }
  return Array.from(collectionSet);
}

export async function computeDashboardKpis(tenantId: string): Promise<DashboardKpis> {
  const collections = uniqueCollectionsForDashboard();
  const results = await Promise.all(collections.map((collectionKey) => listEntities(tenantId, collectionKey)));

  const dataByCollection = Object.fromEntries(collections.map((collectionKey, index) => [collectionKey, results[index]])) as Partial<
    Record<CollectionKey, Array<Record<string, unknown>>>
  >;

  const tenders = (dataByCollection.tenders || []) as Array<{ status: string; amount: number; closeDate: string }>;
  const contracts = (dataByCollection.contracts || []) as Array<{ status: string }>;
  const operations = (dataByCollection.operationTasks || []) as Array<{ status: string }>;
  const finance = (dataByCollection.financeEntries || []) as Array<{ dueDate: string; type: string; amount: number }>;
  const vacancies = (dataByCollection.vacancies || []) as Array<{ status: string }>;
  const candidates = (dataByCollection.candidates || []) as Array<{ stage: string }>;
  const personDocuments = (dataByCollection.personDocuments || []) as Array<{ status: string }>;

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
