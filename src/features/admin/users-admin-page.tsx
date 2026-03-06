"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { useApiClient } from "@/lib/api/use-api-client";
import { USER_ROLES } from "@/types/auth";
import type { AdminUserSummary, UserRole } from "@/types/domain";
import { EmptyState, InlineError, ModulePage, Panel, SkeletonRows, Toast } from "@/features/modules/module-ui";

type UsersResponse = {
  data: AdminUserSummary[];
  pageToken: string | null;
};

type UpdateClaimsResponse = {
  ok: boolean;
  data: {
    uid: string;
    role: UserRole;
    tenantId: string;
  };
};

type PendingChange = {
  uid: string;
  email: string | null;
  role: UserRole;
  tenantId: string;
};

function toQueryParams(params: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    search.set(key, value);
  }
  return search.toString();
}

export function UsersAdminPage() {
  const api = useApiClient();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [tenantFilter, setTenantFilter] = useState(DEFAULT_TENANT_ID);

  const [pageToken, setPageToken] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [pageHistory, setPageHistory] = useState<string[]>([]);

  const [drafts, setDrafts] = useState<Record<string, { role: UserRole; tenantId: string }>>({});
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);

  const hasPreviousPage = pageHistory.length > 0;

  const fetchUsers = useCallback(
    async (token?: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const queryString = toQueryParams({
          q: query.trim() || null,
          role: roleFilter === "all" ? null : roleFilter,
          tenantId: tenantFilter || DEFAULT_TENANT_ID,
          limit: "25",
          pageToken: token || null
        });

        const response = await api.get<UsersResponse>(`/api/admin/users?${queryString}`);
        setUsers(response.data);
        setNextPageToken(response.pageToken);
        setDrafts(
          Object.fromEntries(
            response.data.map((user) => [
              user.uid,
              { role: user.role, tenantId: user.tenantId || tenantFilter || DEFAULT_TENANT_ID }
            ])
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar usuarios.");
      } finally {
        setLoading(false);
      }
    },
    [api, query, roleFilter, tenantFilter]
  );

  useEffect(() => {
    void fetchUsers(pageToken);
  }, [fetchUsers, pageToken]);

  const selectedUser = useMemo(
    () => (pendingChange ? users.find((user) => user.uid === pendingChange.uid) || null : null),
    [pendingChange, users]
  );

  return (
    <ModulePage
      title="Administracion de usuarios y roles"
      description="Asignacion de rol y tenant sobre usuarios existentes en Firebase Auth."
    >
      <Toast message={toast?.message || null} tone={toast?.tone || "info"} />
      <Panel title="Filtros y busqueda">
        <div className="toolbar">
          <label>
            Buscar (email/nombre/uid)
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ej: usuario@empresa.com"
            />
          </label>
          <label>
            Rol
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | UserRole)}>
              <option value="all">Todos</option>
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tenant
            <input value={tenantFilter} onChange={(event) => setTenantFilter(event.target.value)} />
          </label>
          <button
            className="btn-primary"
            type="button"
            onClick={() => {
              setPageToken(null);
              setPageHistory([]);
              void fetchUsers(null);
            }}
          >
            Aplicar filtros
          </button>
        </div>
        <InlineError message={error} />
      </Panel>

      <Panel
        title="Usuarios"
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-secondary"
              type="button"
              disabled={!hasPreviousPage || loading}
              onClick={() => {
                const previous = pageHistory[pageHistory.length - 1];
                setPageHistory((current) => current.slice(0, -1));
                setPageToken(previous || null);
              }}
            >
              Anterior
            </button>
            <button
              className="btn-secondary"
              type="button"
              disabled={!nextPageToken || loading}
              onClick={() => {
                setPageHistory((current) => [...current, pageToken || ""]);
                setPageToken(nextPageToken);
              }}
            >
              Siguiente
            </button>
          </div>
        }
      >
        {loading ? <SkeletonRows rows={6} /> : null}
        {!loading && users.length === 0 ? <EmptyState message="No se encontraron usuarios con esos filtros." /> : null}
        {!loading && users.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nombre</th>
                  <th>UID</th>
                  <th>Ultimo acceso</th>
                  <th>Rol</th>
                  <th>Tenant</th>
                  <th>Estado</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const draft = drafts[user.uid] || {
                    role: user.role,
                    tenantId: user.tenantId || tenantFilter || DEFAULT_TENANT_ID
                  };
                  const changed = draft.role !== user.role || draft.tenantId !== (user.tenantId || DEFAULT_TENANT_ID);
                  return (
                    <tr key={user.uid}>
                      <td>{user.email || "Sin email"}</td>
                      <td>{user.displayName || "-"}</td>
                      <td>{user.uid}</td>
                      <td>{user.lastSignInTime || "Sin acceso"}</td>
                      <td>
                        <select
                          value={draft.role}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [user.uid]: {
                                role: event.target.value as UserRole,
                                tenantId: draft.tenantId
                              }
                            }))
                          }
                        >
                          {USER_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={draft.tenantId}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [user.uid]: {
                                role: draft.role,
                                tenantId: event.target.value
                              }
                            }))
                          }
                        />
                      </td>
                      <td>{user.disabled ? "Deshabilitado" : "Activo"}</td>
                      <td>
                        <button
                          className="btn-primary"
                          type="button"
                          disabled={!changed || saving}
                          onClick={() =>
                            setPendingChange({
                              uid: user.uid,
                              email: user.email,
                              role: draft.role,
                              tenantId: draft.tenantId || DEFAULT_TENANT_ID
                            })
                          }
                        >
                          Guardar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      {pendingChange ? (
        <Panel title="Confirmar actualizacion de claims">
          <p>
            Se actualizara el usuario <strong>{pendingChange.email || pendingChange.uid}</strong> a rol{" "}
            <strong>{pendingChange.role}</strong> en tenant <strong>{pendingChange.tenantId}</strong>.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-secondary" type="button" onClick={() => setPendingChange(null)} disabled={saving}>
              Cancelar
            </button>
            <button
              className="btn-primary"
              type="button"
              disabled={saving}
              onClick={() => {
                if (!pendingChange) return;
                setSaving(true);
                setError(null);
                void api
                  .patch<UpdateClaimsResponse>("/api/admin/users", pendingChange)
                  .then(() => {
                    setToast({ message: "Claims actualizados correctamente.", tone: "success" });
                    setPendingChange(null);
                    return fetchUsers(pageToken);
                  })
                  .catch((err) => {
                    setError(err instanceof Error ? err.message : "No se pudo actualizar claims.");
                    setToast({ message: "No se pudo actualizar claims.", tone: "error" });
                  })
                  .finally(() => setSaving(false));
              }}
            >
              Confirmar
            </button>
          </div>
          {selectedUser?.role !== pendingChange.role || selectedUser?.tenantId !== pendingChange.tenantId ? (
            <p className="inline-error">El cambio impactara permisos al refrescar el token del usuario afectado.</p>
          ) : null}
        </Panel>
      ) : null}
    </ModulePage>
  );
}
