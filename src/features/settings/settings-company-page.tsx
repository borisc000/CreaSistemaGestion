"use client";

import { useCallback, useEffect, useState } from "react";
import { useApiClient } from "@/lib/api/use-api-client";
import { useAuth } from "@/features/auth/auth-provider";
import { InlineError, Panel, Toast } from "@/features/modules/module-ui";
import type { TenantCurrency } from "@/types/domain";

type CompanySettingsResponse = {
  data: {
    company: {
      currency: TenantCurrency;
    };
  };
};

export function SettingsCompanyPage() {
  const api = useApiClient();
  const { role, refreshClaims } = useAuth();
  const [currency, setCurrency] = useState<TenantCurrency>("CLP");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);
  const canEdit = role === "tenant_admin" || role === "platform_admin";

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<CompanySettingsResponse>("/api/tenant/settings/company");
      setCurrency(response.data.company.currency);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la configuracion de empresa.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <>
      <Toast message={toast?.message || null} tone={toast?.tone || "info"} />
      <Panel title="Empresa">
        <p style={{ marginTop: 0, color: "var(--text-soft)" }}>
          Configura la moneda operativa por defecto para mostrar montos en el tenant.
        </p>
        <InlineError message={error} />
        {loading ? <p>Cargando configuracion...</p> : null}
        {!loading ? (
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              setSaving(true);
              void api
                .patch("/api/tenant/settings/company", { currency })
                .then(async () => {
                  await refreshClaims();
                  setToast({ message: "Configuracion de empresa actualizada.", tone: "success" });
                })
                .catch((err) => {
                  setToast({
                    message: err instanceof Error ? err.message : "No se pudo actualizar la moneda.",
                    tone: "error"
                  });
                })
                .finally(() => setSaving(false));
            }}
          >
            <label>
              Moneda
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value as TenantCurrency)}
                disabled={!canEdit || saving}
              >
                <option value="CLP">CLP</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <div className="form-actions">
              <button className="btn-primary" type="submit" disabled={!canEdit || saving}>
                Guardar moneda
              </button>
              <button
                className="btn-secondary"
                type="button"
                disabled={saving}
                onClick={() => {
                  void loadSettings();
                }}
              >
                Recargar
              </button>
            </div>
            {!canEdit ? (
              <p className="inline-error">Solo tenant_admin o platform_admin pueden editar esta configuracion.</p>
            ) : null}
          </form>
        ) : null}
      </Panel>
    </>
  );
}
