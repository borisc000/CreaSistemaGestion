# MVP Reclutamiento y Selección

Webapp MVP genérica para gestionar el proceso completo de reclutamiento y selección: desde ingreso de candidato hasta contratación/rechazo.

## Alcance funcional

- Gestión de vacantes (cargo, área, seniority, cupos, estado, fecha objetivo).
- Registro de candidatos con datos mínimos y fuente.
- Pipeline visual por etapas:
  - Ingreso
  - Pre-filtro CV (obligatoria)
  - Entrevista RRHH (obligatoria)
  - Entrevista área/técnica (opcional)
  - Evaluación final (opcional)
  - Oferta (obligatoria para contratar)
  - Contratado / Rechazado
- Ficha de candidato con:
  - Notas de seguimiento
  - Agendamiento de entrevistas
  - Evaluaciones por criterio (1-5)
  - Movimiento de etapa
- Dashboard con KPIs:
  - Candidatos activos
  - Contratados
  - Conversión
  - Tiempo promedio a contratación
  - Entrevistas próximas
  - Riesgos operativos
- Roles base escalables:
  - Administrador
  - Responsable reclutamiento
  - Entrevistador
  - Consulta

## Decisiones MVP

- Persistencia local con `localStorage` (sin backend).
- Incluye datos demo iniciales para probar el flujo de inmediato.
- Pensado como módulo enchufable a suite RRHH (vía integraciones futuras).

## Cómo ejecutar

1. Abrir [index.html](./index.html) en navegador.
2. O servir carpeta con un servidor estático, por ejemplo:

```powershell
python -m http.server 5500
```

Luego abrir `http://localhost:5500`.

## Estructura

- [index.html](./index.html): interfaz principal.
- [styles.css](./styles.css): estilo visual y responsive.
- [app.js](./app.js): reglas de negocio, pipeline, KPIs y persistencia local.
