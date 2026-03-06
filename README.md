# Sistema Pyme Contratistas - MVP multipagina

MVP demo para PYMEs que gestionan:
- licitaciones,
- contratos adjudicados,
- operacion del contrato,
- finanzas por contrato,
- RRHH de soporte operativo.

## Que cambio en esta version

- Se paso de una sola vista a **multipagina**.
- Se cambio el foco de \"subcontratistas\" a **contratistas y contratos ganados**.
- Se mejoro el modelo de datos para relacionar modulos:
  - licitacion -> contrato -> operacion/finanzas/RRHH.
- Se mantuvo persistencia local (`localStorage`) para iterar rapido antes de cloud.

## Paginas

- [index.html](./index.html): dashboard ejecutivo.
- [licitaciones.html](./licitaciones.html): pipeline de oportunidades.
- [contratos.html](./contratos.html): cartera adjudicada, margen y avance.
- [operaciones.html](./operaciones.html): tablero de tareas por contrato.
- [finanzas.html](./finanzas.html): movimientos y flujo por contrato.
- [rrhh.html](./rrhh.html): RRHH - reclutamiento y seleccion.
- [rrhh-personas.html](./rrhh-personas.html): RRHH - gestion de personas y documentos.
- [arquitectura.html](./arquitectura.html): readiness y roadmap tecnico.

## Roles demo

- Administrador
- Lider Licitaciones
- Contract Manager
- Analista Finanzas
- Lider RRHH
- Solo lectura

Cada rol habilita solo las acciones de su modulo.

## Como ejecutar

1. Entrar a la carpeta del proyecto:

```powershell
Set-Location C:\Users\boris\OneDrive\Documentos\SistemaGestionCrea\ReclutamientoSeleccion
```

2. Modo desarrollo con npm (recomendado):

```powershell
npm.cmd run dev
```

3. Alternativa sin npm (servidor estatico):

```powershell
python -m http.server 5500
```

Luego abrir `http://localhost:5500`.

## Estructura tecnica

- [app.js](./app.js): motor compartido por pagina (estado, permisos, CRUD, KPIs).
- [styles.css](./styles.css): layout, navegacion y componentes visuales.
- HTML multipagina: separacion por modulo de negocio.

## Stack actual

No estamos en React + Node backend.

- Frontend: HTML/CSS/JS vanilla (multipagina).
- Tooling: Vite (dev server + build).
- Persistencia: `localStorage`.
- Backend: no hay backend aun (por eso luego conectamos Firebase).

Alternativas viables para siguiente fase:
- Mantener vanilla + Firebase (rapido para MVP).
- Migrar a React + Vite + Firebase (mejor escalabilidad UI).
- Migrar a Next.js + Firebase (SSR/rutas avanzadas si luego lo necesitas).

## Publicar en GitHub Pages

Ya esta agregado workflow de deploy automatico:
- [deploy-pages.yml](./.github/workflows/deploy-pages.yml)

Al hacer push a `master`, GitHub Actions genera `dist/` y publica en Pages.

Pasos:
1. Crear repo en GitHub.
2. Conectar remoto y push:

```powershell
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git add .
git commit -m "MVP multipagina con RRHH submodulos"
git push -u origin master
```

3. En GitHub: `Settings -> Pages -> Source: GitHub Actions`.

## Conexion a Firebase (siguiente iteracion)

Esta version aun NO esta conectada a Firebase. Se recomienda avanzar asi:

1. **Inicializar proyecto Firebase**
   - crear proyecto en Firebase Console.
   - habilitar Auth (email/password al inicio).
   - crear Firestore en modo produccion.

2. **Modelar colecciones multi-tenant**
   - `tenants/{tenantId}/tenders`
   - `tenants/{tenantId}/contracts`
   - `tenants/{tenantId}/operationTasks`
   - `tenants/{tenantId}/financeEntries`
   - `tenants/{tenantId}/vacancies`
   - `tenants/{tenantId}/candidates`
   - `tenants/{tenantId}/peopleRecords`
   - `tenants/{tenantId}/personDocuments`

3. **Crear roles en Auth + custom claims**
   - `admin`, `tender_lead`, `contract_manager`, `finance`, `hr`, `viewer`.

4. **Security Rules**
   - filtrar por `tenantId`.
   - permitir lectura/escritura segun rol y modulo.

5. **Migrar capa de almacenamiento**
   - reemplazar funciones `loadData/persist` de `localStorage` por repositorios Firestore.
   - mantener misma UI para no rehacer pantallas.

6. **Despliegue**
   - Firebase Hosting para frontend.
   - (opcional) Cloud Functions para auditoria, alertas y automatizaciones.

Si quieres, en la proxima iteracion te dejo conectada la primera pagina (`licitaciones`) a Firestore real y desde ahi replicamos al resto.
