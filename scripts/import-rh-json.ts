import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { normalizeRut } from "../src/server/domain/rut";

type ImportContract = {
  name: string;
  client: string;
  startDate: string;
  endDate: string;
  status: "planning" | "active" | "at_risk" | "closed";
};

type ImportPerson = {
  row: number;
  fullName: string;
  idNumber: string;
  position: string;
  contractName?: string | null;
  hireDate: string;
  employmentStatus: "active" | "on_leave" | "inactive";
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  nationality?: string | null;
  maritalStatus?: string | null;
  addressLine?: string | null;
  district?: string | null;
  city?: string | null;
  country?: string | null;
  jobFunction?: string | null;
  employmentType?: string | null;
  contractEndDate?: string | null;
  workSchedule?: string | null;
  workHours?: string | null;
  externalCode?: string | null;
  purchaseOrder?: string | null;
  healthProvider?: string | null;
  pensionFund?: string | null;
  baseSalary?: number | null;
  mealAllowance?: number | null;
  transportAllowance?: number | null;
  otherBonuses?: number | null;
};

type ImportPayload = {
  tenantId: string;
  sourceFile: string;
  generatedAt: string;
  peopleCount: number;
  contractsCount: number;
  contracts: ImportContract[];
  people: ImportPerson[];
};

function getCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }
  return applicationDefault();
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function safeMoney(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) return null;
  return value;
}

function cleanUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, nested]) => nested !== undefined)) as T;
}

async function main() {
  const importFilePath = resolve(process.argv[2] || "tmp/wolotec-rh-import.json");
  const payload = JSON.parse(readFileSync(importFilePath, "utf8")) as ImportPayload;
  const tenantId = process.argv[3] || payload.tenantId || "wolotec";

  if (!getApps().length) {
    initializeApp({
      credential: getCredential(),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    });
  }

  const db = getFirestore();
  const tenantRef = db.collection("tenants").doc(tenantId);
  const nowIso = new Date().toISOString();

  const [contractsSnapshot, peopleSnapshot, assignmentsSnapshot] = await Promise.all([
    tenantRef.collection("contracts").get(),
    tenantRef.collection("peopleRecords").get(),
    tenantRef.collection("personContractAssignments").get()
  ]);

  const contractIdByName = new Map<string, string>();
  for (const doc of contractsSnapshot.docs) {
    const data = doc.data() as { name?: string };
    if (!data.name) continue;
    contractIdByName.set(normalizeKey(data.name), doc.id);
  }

  let createdContracts = 0;
  let updatedContracts = 0;

  for (const contract of payload.contracts) {
    const key = normalizeKey(contract.name);
    const existingId = contractIdByName.get(key);

    if (existingId) {
      const ref = tenantRef.collection("contracts").doc(existingId);
      const previous = (await ref.get()).data() || {};
      await ref.set(
        cleanUndefined({
          name: contract.name,
          client: contract.client,
          startDate: contract.startDate,
          endDate: contract.endDate,
          status: contract.status,
          tenderId: previous.tenderId ?? null,
          totalValue: typeof previous.totalValue === "number" ? previous.totalValue : 0,
          costEstimate: typeof previous.costEstimate === "number" ? previous.costEstimate : 0,
          manager: typeof previous.manager === "string" && previous.manager.trim() ? previous.manager : "Pendiente asignacion",
          progress: typeof previous.progress === "number" ? previous.progress : 0,
          createdAt: previous.createdAt || nowIso,
          updatedAt: nowIso
        }),
        { merge: true }
      );
      updatedContracts += 1;
      continue;
    }

    const newId = randomUUID();
    await tenantRef.collection("contracts").doc(newId).set({
      tenderId: null,
      name: contract.name,
      client: contract.client,
      totalValue: 0,
      costEstimate: 0,
      startDate: contract.startDate,
      endDate: contract.endDate,
      manager: "Pendiente asignacion",
      status: contract.status,
      progress: 0,
      createdAt: nowIso,
      updatedAt: nowIso
    });
    contractIdByName.set(key, newId);
    createdContracts += 1;
  }

  const peopleByRut = new Map<string, { id: string; data: Record<string, unknown> }>();
  for (const doc of peopleSnapshot.docs) {
    const data = doc.data() as { rutNormalized?: string | null; idNumber?: string };
    const rut = data.rutNormalized || (data.idNumber ? normalizeRut(data.idNumber) : null);
    if (!rut) continue;
    peopleByRut.set(rut, { id: doc.id, data: doc.data() });
  }

  type AssignmentKey = `${string}|${string}`;
  const assignmentByKey = new Map<AssignmentKey, { id: string; data: Record<string, unknown> }>();
  for (const doc of assignmentsSnapshot.docs) {
    const data = doc.data() as { personId?: string; contractId?: string };
    if (!data.personId || !data.contractId) continue;
    assignmentByKey.set(`${data.personId}|${data.contractId}`, { id: doc.id, data: doc.data() });
  }

  let createdPeople = 0;
  let updatedPeople = 0;
  let createdAssignments = 0;
  let updatedAssignments = 0;

  for (const person of payload.people) {
    const rutNormalized = normalizeRut(person.idNumber);
    const contractName = normalizeOptionalText(person.contractName || null);
    const contractId = contractName ? contractIdByName.get(normalizeKey(contractName)) || null : null;
    const personPayload = cleanUndefined({
      fullName: person.fullName.trim(),
      idNumber: rutNormalized,
      rutNormalized,
      position: person.position.trim(),
      contractId,
      hireDate: person.hireDate,
      employmentStatus: person.employmentStatus,
      email: normalizeOptionalText(person.email),
      phone: normalizeOptionalText(person.phone),
      birthDate: normalizeOptionalText(person.birthDate),
      nationality: normalizeOptionalText(person.nationality),
      maritalStatus: normalizeOptionalText(person.maritalStatus),
      addressLine: normalizeOptionalText(person.addressLine),
      district: normalizeOptionalText(person.district),
      city: normalizeOptionalText(person.city),
      country: normalizeOptionalText(person.country),
      jobFunction: normalizeOptionalText(person.jobFunction),
      employmentType: normalizeOptionalText(person.employmentType),
      contractEndDate: normalizeOptionalText(person.contractEndDate),
      workSchedule: normalizeOptionalText(person.workSchedule),
      workHours: normalizeOptionalText(person.workHours),
      externalCode: normalizeOptionalText(person.externalCode),
      purchaseOrder: normalizeOptionalText(person.purchaseOrder),
      healthProvider: normalizeOptionalText(person.healthProvider),
      pensionFund: normalizeOptionalText(person.pensionFund),
      baseSalary: safeMoney(person.baseSalary),
      mealAllowance: safeMoney(person.mealAllowance),
      transportAllowance: safeMoney(person.transportAllowance),
      otherBonuses: safeMoney(person.otherBonuses),
      updatedAt: nowIso
    });

    let personId: string;
    const existingPerson = peopleByRut.get(rutNormalized);

    if (existingPerson) {
      personId = existingPerson.id;
      await tenantRef.collection("peopleRecords").doc(existingPerson.id).set(
        {
          ...personPayload,
          createdAt: existingPerson.data.createdAt || nowIso
        },
        { merge: true }
      );
      updatedPeople += 1;
    } else {
      personId = randomUUID();
      await tenantRef.collection("peopleRecords").doc(personId).set({
        ...personPayload,
        createdAt: nowIso
      });
      createdPeople += 1;
    }

    if (!contractId) {
      continue;
    }

    const assignmentKey: AssignmentKey = `${personId}|${contractId}`;
    const existingAssignment = assignmentByKey.get(assignmentKey);
    const assignmentStatus = person.employmentStatus === "inactive" ? "inactive" : "active";
    const assignmentEndDate =
      assignmentStatus === "inactive"
        ? normalizeOptionalText(person.contractEndDate) || nowIso.slice(0, 10)
        : normalizeOptionalText(person.contractEndDate);

    if (existingAssignment) {
      await tenantRef.collection("personContractAssignments").doc(existingAssignment.id).set(
        {
          personId,
          contractId,
          startDate: person.hireDate,
          endDate: assignmentEndDate,
          status: assignmentStatus,
          createdAt: existingAssignment.data.createdAt || nowIso,
          updatedAt: nowIso
        },
        { merge: true }
      );
      updatedAssignments += 1;
    } else {
      const assignmentId = randomUUID();
      await tenantRef.collection("personContractAssignments").doc(assignmentId).set({
        personId,
        contractId,
        startDate: person.hireDate,
        endDate: assignmentEndDate,
        status: assignmentStatus,
        createdAt: nowIso,
        updatedAt: nowIso
      });
      createdAssignments += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        tenantId,
        sourceFile: payload.sourceFile,
        importFilePath,
        summary: {
          contracts: {
            created: createdContracts,
            updated: updatedContracts
          },
          people: {
            created: createdPeople,
            updated: updatedPeople
          },
          assignments: {
            created: createdAssignments,
            updated: updatedAssignments
          }
        }
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
