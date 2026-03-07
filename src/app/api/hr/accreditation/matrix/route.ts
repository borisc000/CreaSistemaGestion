import type { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import {
  buildAccreditationMatrix,
  ensureDefaultAccreditationTemplates,
  isDateRangeActive
} from "@/server/domain/accreditation";
import { getEntity, listEntities } from "@/server/repositories/firestore-repository";
import type {
  AccreditationRequirementStatus,
  AccreditationTemplate,
  Contract,
  PersonContractAssignment,
  PersonDocument,
  PersonRecord
} from "@/types/domain";

function requireParam(value: string | null, label: string): string {
  if (!value || !value.trim()) {
    throw new ApiError(400, `${label} is required.`);
  }
  return value.trim();
}

function parseAsOf(value: string | null): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, "asOf must be a valid date.");
  }
  return parsed;
}

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people", "read");
    const personId = requireParam(req.nextUrl.searchParams.get("personId"), "personId");
    const contractId = requireParam(req.nextUrl.searchParams.get("contractId"), "contractId");
    const asOf = parseAsOf(req.nextUrl.searchParams.get("asOf"));

    await ensureDefaultAccreditationTemplates(context.tenantId);

    const [person, contract, templates, documents, assignments] = await Promise.all([
      getEntity(context.tenantId, "peopleRecords", personId) as Promise<PersonRecord | null>,
      getEntity(context.tenantId, "contracts", contractId) as Promise<Contract | null>,
      listEntities(context.tenantId, "accreditationTemplates") as Promise<AccreditationTemplate[]>,
      listEntities(context.tenantId, "personDocuments") as Promise<PersonDocument[]>,
      listEntities(context.tenantId, "personContractAssignments") as Promise<PersonContractAssignment[]>
    ]);

    if (!person) {
      throw new ApiError(404, "Person not found.");
    }
    if (!contract) {
      throw new ApiError(404, "Contract not found.");
    }

    const personDocuments = documents.filter((document) => document.personId === person.id);
    const personAssignments = assignments.filter(
      (assignment) => assignment.personId === person.id && assignment.contractId === contract.id
    );
    const activeAssignment = personAssignments.some(
      (assignment) => assignment.status === "active" && isDateRangeActive(assignment, asOf)
    );

    const matrix = buildAccreditationMatrix({
      contract,
      templates,
      documents: personDocuments,
      asOf
    });

    const summary = matrix.reduce(
      (acc, requirement) => {
        acc.total += 1;
        acc[requirement.status] += 1;
        return acc;
      },
      {
        total: 0,
        pending: 0,
        expired: 0,
        compliant: 0,
        reused: 0
      } as Record<AccreditationRequirementStatus | "total", number>
    );

    return jsonOk({
      data: {
        person,
        contract,
        asOf: asOf.toISOString(),
        isAssignedToContract: person.contractId === contract.id || activeAssignment,
        summary,
        requirements: matrix
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
