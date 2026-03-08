"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MODULE_KEYS, getModuleDefinition } from "@/modules/registry";
import { USER_ROLES, type UserRole } from "@/types/auth";
import type { ModuleKey } from "@/types/domain";
import { useApiClient } from "@/lib/api/use-api-client";
import { InlineError, Panel, Toast } from "@/features/modules/module-ui";

type RoleAccess = {
  read: boolean;
  write: boolean;
};

type ModulePolicyMatrix = Record<ModuleKey, Record<UserRole, RoleAccess>>;

type PolicyResponse = {
  data: {
    modules: ModulePolicyMatrix;
    updatedAt: string | null;
    updatedByUid: string | null;
  };
};

function toLabel(value: string): string {
  return value.replace(/_/g, " ");
}

export function SettingsRolesPage() {
  const api = useApiClient();
  const [matrix, setMatrix] = useState<ModulePolicyMatrix | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<PolicyResponse>("/api/platform/settings/module-policy");
      setMatrix(response.data.modules);
      setUpdatedAt(response.data.updatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la politica de modulos.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  const groupedColumns = useMemo(() => USER_ROLES, []);

  return (
    <>
      <Toast message={toast?.message || null} tone={toast?.tone || "info"} />
      <Panel title="Roles y acceso global a modulos">
        <p style={{ marginTop: 0, color: "var(--text-soft)" }}>
          Politica global aplicada por interseccion con permisos estaticos y modulos habilitados por tenant.
        </p>
        <InlineError message={error} />
        {loading ? <p>Cargando politica...</p> : null}
        {!loading && matrix ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Modulo</th>
                  {groupedColumns.map((role) => (
                    <th key={`${role}-r`}>{toLabel(role)} (R)</th>
                  ))}
                  {groupedColumns.map((role) => (
                    <th key={`${role}-w`}>{toLabel(role)} (W)</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULE_KEYS.map((moduleKey) => {
                  const moduleDefinition = getModuleDefinition(moduleKey);
                  return (
                    <tr key={moduleKey}>
                      <td>{moduleDefinition.label}</td>
                      {groupedColumns.map((role) => {
                        const staticAccess = moduleDefinition.accessPolicy[role];
                        const value = matrix[moduleKey]?.[role]?.read || false;
                        const locked = moduleKey === "platform" && role === "platform_admin";
                        const disabled = locked || !staticAccess.read || saving;
                        return (
                          <td key={`${moduleKey}-${role}-r`}>
                            <input
                              type="checkbox"
                              checked={value}
                              disabled={disabled}
                              onChange={(event) => {
                                const nextRead = event.target.checked;
                                setMatrix((current) => {
                                  if (!current) return current;
                                  return {
                                    ...current,
                                    [moduleKey]: {
                                      ...current[moduleKey],
                                      [role]: {
                                        ...current[moduleKey][role],
                                        read: nextRead,
                                        write: nextRead ? current[moduleKey][role].write : false
                                      }
                                    }
                                  };
                                });
                              }}
                            />
                          </td>
                        );
                      })}
                      {groupedColumns.map((role) => {
                        const staticAccess = moduleDefinition.accessPolicy[role];
                        const roleAccess = matrix[moduleKey]?.[role] || { read: false, write: false };
                        const locked = moduleKey === "platform" && role === "platform_admin";
                        const disabled = locked || !staticAccess.write || !roleAccess.read || saving;
                        return (
                          <td key={`${moduleKey}-${role}-w`}>
                            <input
                              type="checkbox"
                              checked={roleAccess.write}
                              disabled={disabled}
                              onChange={(event) => {
                                const nextWrite = event.target.checked;
                                setMatrix((current) => {
                                  if (!current) return current;
                                  return {
                                    ...current,
                                    [moduleKey]: {
                                      ...current[moduleKey],
                                      [role]: {
                                        ...current[moduleKey][role],
                                        write: nextWrite,
                                        read: nextWrite ? true : current[moduleKey][role].read
                                      }
                                    }
                                  };
                                });
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="toolbar">
          <button
            className="btn-primary"
            type="button"
            disabled={!matrix || loading || saving}
            onClick={() => {
              if (!matrix) return;
              setSaving(true);
              void api
                .patch<{ ok: boolean }>("/api/platform/settings/module-policy", { modules: matrix })
                .then(() => {
                  setToast({ message: "Politica de modulos actualizada.", tone: "success" });
                  return loadPolicy();
                })
                .catch((err) => {
                  setToast({
                    message: err instanceof Error ? err.message : "No se pudo actualizar la politica.",
                    tone: "error"
                  });
                })
                .finally(() => setSaving(false));
            }}
          >
            Guardar politica
          </button>
          <button
            className="btn-secondary"
            type="button"
            disabled={loading || saving}
            onClick={() => {
              void loadPolicy();
            }}
          >
            Recargar
          </button>
          <span style={{ color: "var(--text-soft)", fontSize: "0.85rem" }}>
            Ultima actualizacion: {updatedAt || "sin cambios"}
          </span>
        </div>
      </Panel>
    </>
  );
}
