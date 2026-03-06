import { ApiError } from "@/server/api/response";
import { getEntity } from "@/server/repositories/firestore-repository";

export async function assertContractExists(tenantId: string, contractId: string | null) {
  if (!contractId) return;
  const exists = await getEntity(tenantId, "contracts", contractId);
  if (!exists) {
    throw new ApiError(400, "Referenced contract does not exist.");
  }
}

export async function assertTenderExists(tenantId: string, tenderId: string | null) {
  if (!tenderId) return;
  const exists = await getEntity(tenantId, "tenders", tenderId);
  if (!exists) {
    throw new ApiError(400, "Referenced tender does not exist.");
  }
}

export async function assertVacancyExists(tenantId: string, vacancyId: string) {
  const exists = await getEntity(tenantId, "vacancies", vacancyId);
  if (!exists) {
    throw new ApiError(400, "Referenced vacancy does not exist.");
  }
}

export async function assertPersonExists(tenantId: string, personId: string) {
  const exists = await getEntity(tenantId, "peopleRecords", personId);
  if (!exists) {
    throw new ApiError(400, "Referenced person does not exist.");
  }
}