import { z } from "zod";
import type { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/server/api/response";
import { getTenantContext } from "@/server/auth/request-context";
import { assertNoOverlappingActiveAssignments } from "@/server/domain/accreditation";
import {
  createEntity,
  getEntity,
  listEntities,
  patchEntity
} from "@/server/repositories/firestore-repository";
import { validateModuleRelations } from "@/server/validation/relations";
import {
  personContractAssignmentCreateSchema,
  personContractAssignmentPatchSchema
} from "@/server/validation/schemas";
import type { PersonContractAssignment, PersonContractAssignmentStatus } from "@/types/domain";

function parseStatus(value: string | null): PersonContractAssignmentStatus | null {
  if (!value || value === "all") return null;
  if (value === "active" || value === "inactive") return value;
  throw new ApiError(400, "status must be active or inactive.");
}

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people", "read");
    const personId = req.nextUrl.searchParams.get("personId");
    const status = parseStatus(req.nextUrl.searchParams.get("status"));

    const assignments = (await listEntities(context.tenantId, "personContractAssignments")) as PersonContractAssignment[];
    const data = assignments
      .filter((assignment) => (personId ? assignment.personId === personId : true))
      .filter((assignment) => (status ? assignment.status === status : true))
      .sort((left, right) => right.startDate.localeCompare(left.startDate));

    return jsonOk({ data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people", "write");
    const parsed = personContractAssignmentCreateSchema.parse(await req.json());
    const payload = {
      ...parsed,
      endDate: parsed.endDate ?? null,
      status: parsed.status ?? "active"
    };

    await validateModuleRelations({
      tenantId: context.tenantId,
      moduleKey: "hr_people",
      relationSet: "personContractAssignments",
      payload,
      mode: "create"
    });

    const assignments = (await listEntities(context.tenantId, "personContractAssignments")) as PersonContractAssignment[];
    assertNoOverlappingActiveAssignments(assignments, payload);

    const created = await createEntity(context.tenantId, "personContractAssignments", payload, {
      uid: context.uid,
      email: context.email,
      role: context.role
    });

    return jsonOk({ data: created }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const context = await getTenantContext(req, "hr_people", "write");
    const parsed = personContractAssignmentPatchSchema.parse(await req.json());
    const existing = (await getEntity(
      context.tenantId,
      "personContractAssignments",
      parsed.id
    )) as PersonContractAssignment | null;
    if (!existing) {
      throw new ApiError(404, "Assignment not found.");
    }

    const merged = {
      id: existing.id,
      personId: parsed.personId ?? existing.personId,
      contractId: parsed.contractId ?? existing.contractId,
      startDate: parsed.startDate ?? existing.startDate,
      endDate: parsed.endDate !== undefined ? parsed.endDate : existing.endDate,
      status: parsed.status ?? existing.status
    };

    const patchPayload = {
      ...parsed,
      endDate: parsed.endDate !== undefined ? parsed.endDate : existing.endDate
    };
    const { id, ...patch } = patchPayload;

    await validateModuleRelations({
      tenantId: context.tenantId,
      moduleKey: "hr_people",
      relationSet: "personContractAssignments",
      payload: patch,
      mode: "patch"
    });

    const assignments = (await listEntities(context.tenantId, "personContractAssignments")) as PersonContractAssignment[];
    assertNoOverlappingActiveAssignments(assignments, merged);

    await patchEntity(context.tenantId, "personContractAssignments", id, patch, {
      uid: context.uid,
      email: context.email,
      role: context.role
    });

    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues.map((issue) => issue.message).join("; ")));
    }
    return jsonError(error);
  }
}
