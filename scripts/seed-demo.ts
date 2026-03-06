import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }

  return applicationDefault();
}

function deriveDocumentStatus(expiryDate: string | null) {
  if (!expiryDate) return "uploaded";
  const now = new Date();
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return "uploaded";

  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "expiring";
  return "uploaded";
}

type EntitySeed = {
  collection: string;
  id: string;
  payload: Record<string, unknown>;
};

async function main() {
  const tenantId = process.env.SEED_TENANT_ID || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || "crea-default";

  if (!getApps().length) {
    initializeApp({
      credential: getCredential(),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  }

  const db = getFirestore();
  const tenantRef = db.collection("tenants").doc(tenantId);

  const nowIso = new Date().toISOString();

  const seedData: EntitySeed[] = [
    {
      collection: "tenders",
      id: "demo-tender-a",
      payload: {
        title: "Mantenimiento Subestacion Norte",
        client: "Minera Atacama",
        amount: 185000,
        closeDate: "2026-04-12",
        probability: 100,
        responsible: "Carolina Mena",
        status: "won"
      }
    },
    {
      collection: "tenders",
      id: "demo-tender-b",
      payload: {
        title: "Soporte Planta Solar Sur",
        client: "Energia Verde SpA",
        amount: 96000,
        closeDate: "2026-04-28",
        probability: 60,
        responsible: "Luis Paredes",
        status: "submitted"
      }
    },
    {
      collection: "contracts",
      id: "demo-contract-a",
      payload: {
        tenderId: "demo-tender-a",
        name: "Contrato Atacama Fase 1",
        client: "Minera Atacama",
        totalValue: 185000,
        costEstimate: 142000,
        startDate: "2026-03-10",
        endDate: "2026-09-30",
        manager: "Daniel Loyola",
        status: "active",
        progress: 35
      }
    },
    {
      collection: "contracts",
      id: "demo-contract-b",
      payload: {
        tenderId: null,
        name: "Servicio Correctivo Planta Sur",
        client: "Energia Verde SpA",
        totalValue: 86000,
        costEstimate: 79000,
        startDate: "2026-02-20",
        endDate: "2026-07-15",
        manager: "Antonia Cruz",
        status: "at_risk",
        progress: 62
      }
    },
    {
      collection: "operationTasks",
      id: "demo-operation-a",
      payload: {
        contractId: "demo-contract-a",
        title: "Liberar permisos de ingreso faena",
        owner: "Daniel Loyola",
        priority: "high",
        dueDate: "2026-03-18",
        status: "blocked"
      }
    },
    {
      collection: "financeEntries",
      id: "demo-finance-a",
      payload: {
        contractId: "demo-contract-a",
        type: "expense",
        concept: "Compra EPP cuadrilla",
        category: "Seguridad",
        amount: 12000,
        dueDate: "2026-03-15",
        status: "pending"
      }
    },
    {
      collection: "financeEntries",
      id: "demo-finance-b",
      payload: {
        contractId: "demo-contract-b",
        type: "income",
        concept: "Estado de pago servicio marzo",
        category: "Facturacion",
        amount: 22000,
        dueDate: "2026-03-20",
        status: "pending"
      }
    },
    {
      collection: "vacancies",
      id: "demo-vacancy-a",
      payload: {
        title: "Supervisor Electrico",
        area: "Operaciones",
        contractId: "demo-contract-a",
        openings: 1,
        targetDate: "2026-03-25",
        status: "open"
      }
    },
    {
      collection: "candidates",
      id: "demo-candidate-a",
      payload: {
        vacancyId: "demo-vacancy-a",
        name: "Valentina Araya",
        source: "LinkedIn",
        salary: 2100,
        stage: "interview",
        hiredAt: null
      }
    },
    {
      collection: "peopleRecords",
      id: "demo-person-b",
      payload: {
        fullName: "Sergio Olguin",
        idNumber: "16.912.001-2",
        position: "Tecnico Mecanico",
        contractId: "demo-contract-b",
        hireDate: "2026-01-10",
        employmentStatus: "active"
      }
    },
    {
      collection: "personDocuments",
      id: "demo-doc-b-carnet",
      payload: {
        personId: "demo-person-b",
        docType: "Carnet",
        fileName: "carnet_sergio_olguin.pdf",
        filePath: `tenants/${tenantId}/people/demo-person-b/documents/demo-doc-b-carnet-carnet_sergio_olguin.pdf`,
        expiryDate: "2026-03-22",
        status: deriveDocumentStatus("2026-03-22")
      }
    }
  ];

  for (const item of seedData) {
    const docRef = tenantRef.collection(item.collection).doc(item.id);
    const existing = await docRef.get();

    await docRef.set(
      {
        ...item.payload,
        createdAt: existing.exists ? existing.data()?.createdAt || nowIso : nowIso,
        updatedAt: nowIso
      },
      { merge: true }
    );
  }

  console.log(`Seed demo completado para tenant ${tenantId}. Registros procesados: ${seedData.length}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
