# Crea Sistema Gestion (MVP v2)

MVP integral para PyME contratistas, reescrito con:

- Next.js 14 (App Router)
- TypeScript
- Firebase Auth (Google)
- Firestore (tenant-aware)
- Firebase Storage (documentos RRHH)
- Cloud Functions v2 (scheduler, alertas, auditoria)
- Preparado para Firebase App Hosting

## Alcance funcional MVP

Modulos implementados:

- Dashboard
- Licitaciones
- Contratos
- Operaciones
- Finanzas
- RRHH / Reclutamiento y seleccion
- RRHH / Gestion de personas y documentos

Navegacion jerarquica con menu lateral y subpaginas RRHH.

## Arquitectura

```text
src/
  app/                 # Rutas Next.js (App Router)
  features/            # UI y logica por modulo
  lib/                 # SDK Firebase client/admin y utilidades
  server/              # autorizacion, validacion, repositorios, servicios
  types/               # tipos de dominio y catalogos
functions/
  src/index.ts         # tareas async, auditoria y asignacion de roles
```

Persistencia Firestore bajo esquema tenant-aware:

- `tenants/{tenantId}/tenders`
- `tenants/{tenantId}/contracts`
- `tenants/{tenantId}/operationTasks`
- `tenants/{tenantId}/financeEntries`
- `tenants/{tenantId}/vacancies`
- `tenants/{tenantId}/candidates`
- `tenants/{tenantId}/peopleRecords`
- `tenants/{tenantId}/personDocuments`

Storage documental RRHH:

- `tenants/{tenantId}/people/{personId}/documents/{docId}-{filename}`

## API interna

Route Handlers:

- `/api/tenders`
- `/api/contracts`
- `/api/operations`
- `/api/finance`
- `/api/hr/recruiting`
- `/api/hr/people`
- `/api/hr/documents`
- `/api/dashboard`
- `/api/modules` (metadata de modulos habilitados)

Roles (custom claims):

- `admin`
- `tender_lead`
- `contract_manager`
- `finance`
- `hr`
- `viewer`

## Requisitos

- Node.js 20+
- npm 10+
- Proyecto Firebase (Auth, Firestore, Storage)

## Configuracion local

1. Instalar dependencias:

```powershell
npm ci
npm --prefix functions ci
```

2. Crear `.env.local` desde `.env.example` y completar:

- `NEXT_PUBLIC_FIREBASE_*`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `NEXT_PUBLIC_DEFAULT_TENANT_ID`

3. Levantar app:

```powershell
npm run dev
```

4. Abrir `http://localhost:3000`.

## Bootstrap del primer admin

Despues del primer login con Google (para crear usuario), asigna claims admin:

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL="tu-email@dominio.com"
$env:BOOTSTRAP_TENANT_ID="crea-default"
npm run bootstrap:admin
```

## Cloud Functions

Build local:

```powershell
npm run functions:build
```

Funciones incluidas:

- `syncDocumentStatuses`: job diario para recalcular estado documental + alertas
- `auditContractChanges`: auditoria sobre contratos (configurable por coleccion)
- `auditFinanceChanges`: auditoria sobre finanzas (configurable por coleccion)
- `assignUserRole`: callable para asignar rol/tenant (solo admin)

## Datos demo

Cargar dataset ficticio idempotente (2 flujos integrados entre modulos):

```powershell
npm run seed:demo
```

Por defecto usa `NEXT_PUBLIC_DEFAULT_TENANT_ID` (o `SEED_TENANT_ID` si se define).

## Seguridad Firebase

Archivos incluidos:

- `firestore.rules`
- `storage.rules`
- `firestore.indexes.json`
- `firebase.json`

Generar `firestore.rules` desde el Module Registry:

```powershell
npm run rules:generate
```

Ejecutar Emulator Suite:

```powershell
firebase emulators:start
```

## App Hosting (dev/prod)

El repo ya esta preparado para trabajar con 2 ambientes.

1. Define aliases en `.firebaserc`:
   - `dev` -> id proyecto Firebase desarrollo
   - `prod` -> id proyecto Firebase produccion
2. En Firebase Console, conecta App Hosting al repo GitHub.
3. Configura ramas:
   - `develop` -> backend de `dev`
   - `main` -> backend de `prod`
4. Configura variables de entorno por ambiente en App Hosting.

## CI

Workflow GitHub Actions (`.github/workflows/deploy-pages.yml`) valida:

- lint
- typecheck
- tests
- build Next
- build Functions

## Estado

Esta version reemplaza el MVP anterior (guardado en `legacy-mvp/`) y deja base lista para continuar con:

- pruebas de integracion sobre Emulator Suite
- endurecimiento de reglas por modulo/rol
- observabilidad y rollout de produccion
