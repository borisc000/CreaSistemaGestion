"use client";

import { useEffect, useState } from "react";
import { useApiClient } from "@/lib/api/use-api-client";
import { formatCurrency } from "@/lib/format";
import type { DashboardKpis } from "@/types/domain";
import { KpiGrid, ModulePage, Panel } from "@/features/modules/module-ui";

type DashboardResponse = { data: DashboardKpis };

export function DashboardPage() {
  const api = useApiClient();
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await api.get<DashboardResponse>("/api/dashboard");
        if (mounted) setKpis(response.data);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "No se pudo cargar dashboard.");
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [api]);

  return (
    <ModulePage
      title="Dashboard Integral"
      description="Vista ejecutiva para licitaciones, contratos, operaciones, finanzas y RRHH."
    >
      {error ? <p className="inline-error">{error}</p> : null}
      <KpiGrid
        items={[
          { label: "Licitaciones abiertas", value: kpis?.openTenders ?? "-" },
          { label: "Contratos activos", value: kpis?.activeContracts ?? "-" },
          { label: "Contratos en riesgo", value: kpis?.riskContracts ?? "-" },
          { label: "Tareas bloqueadas", value: kpis?.blockedTasks ?? "-" },
          { label: "Flujo neto mes", value: kpis ? formatCurrency(kpis.monthNetFlow) : "-" },
          { label: "Vacantes abiertas", value: kpis?.openVacancies ?? "-" },
          { label: "Candidatos activos", value: kpis?.activeCandidates ?? "-" },
          { label: "Docs vencidos", value: kpis?.expiredDocuments ?? "-" }
        ]}
      />

      <Panel title="Estado actual">
        <p>
          Este dashboard consume datos reales desde Firestore (tenant-aware). Si no ves resultados, valida claims de rol,
          tenant activo y configuracion Firebase.
        </p>
      </Panel>
    </ModulePage>
  );
}