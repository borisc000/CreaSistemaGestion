# Crea Sistema Gestion (MVP v2.1 SaaS)

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
- `/api/onboarding/tenant` (legacy, solo platform_admin)
- `/api/tenant/users` (usuarios por tenant)
- `/api/tenant/invitations` (invitaciones por tenant)
- `/api/auth/context` (contexto auth + memberships)
- `/api/auth/switch-tenant` (cambio de empresa activa)
- `/api/auth/accept-invitation` (aceptacion de invitacion)
- `/api/platform/tenants` (consola global platform_admin)
- `/api/platform/domains` (dominios tenant)

Roles (custom claims):

- `platform_admin`
- `tenant_admin`
- `tenant_manager` (todos los modulos operativos + gestion de usuarios del tenant, sin auditoria/plataforma)
- `tender_lead`
- `contract_manager`
- `finance`
- `hr`
- `viewer`

## Flujos SaaS (como se usa)

### 1) Usuario nuevo (sin empresa)

1. Inicia sesion con Google o email/password.
2. Si no tiene memberships activas, debe ser asignado por `platform_admin`.
3. El `platform_admin` crea/gestiona empresa desde `/platform`.
4. El `platform_admin` asigna email + rol + tenant.

### 2) Agregar otro usuario a la misma empresa

1. Entrar con un `tenant_admin`.
2. Ir a `Administracion > Usuarios y roles`.
3. Crear invitacion al correo objetivo.
4. El invitado abre el link (`/invitacion/aceptar?token=...`) e inicia sesion con ese mismo email.
5. Acepta la invitacion y entra al ambiente.

Importante: para pertenecer a una empresa existente, **debe ser invitado**.
No queda asociado automaticamente solo por entrar con Google.

### 2.1) Asignacion directa desde consola Platform

1. Entrar como `platform_admin` a `/platform`.
2. Usar `Asignar usuario a empresa` (tenantId + email + rol).
3. Si el correo ya existe en Firebase Auth, queda activo en ese tenant sin invitacion manual.
4. Si no existe en Auth, ese correo debe iniciar sesion una vez (o usar invitacion).

### 3) Un mismo usuario en mas de una empresa

Opciones:

1. Ser asignado/invitado al tenant desde `platform_admin`.
2. O ser invitado (mismo email) desde otra empresa.

Luego puede cambiar de ambiente desde el selector `Ambiente` en la cabecera (topbar).

## Prueba rapida recomendada

Caso con dos correos tuyos:

1. Correo A (`platform_admin`): crea Empresa A en `/platform`.
2. Correo A: asigna Correo B a Empresa A (rol) desde `/platform` o invita desde admin tenant.
3. Correo B: login -> abre link (si aplica) y acepta invitacion.
4. Correo B: verifica acceso solo a Empresa A.
5. Correo A: asigna/invita Correo B a Empresa B.
6. Correo B: usa selector `Ambiente` para cambiar entre Empresa A y Empresa B.

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

## Bootstrap del primer tenant admin

Despues del primer login con Google (para crear usuario), asigna claims:

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL="tu-email@dominio.com"
$env:BOOTSTRAP_TENANT_ID="crea-default"
$env:BOOTSTRAP_PLATFORM_ADMIN="false" # true si quieres plataforma global
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
- `assignUserRole`: callable para asignar claims (tenant_admin/platform_admin)

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
