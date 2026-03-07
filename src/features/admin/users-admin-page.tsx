"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TENANT_MEMBER_ROLES, getTenantRoleLabel, type TenantRole } from "@/lib/auth/roles";
import { useApiClient } from "@/lib/api/use-api-client";
import type { AdminUserSummary, TenantInvitation } from "@/types/domain";
import {
  EmptyState,
  FormDrawer,
  InlineError,
  ModuleActionBar,
  ModulePage,
  Panel,
  SkeletonRows,
  Toast
} from "@/features/modules/module-ui";

type UsersResponse = { data: AdminUserSummary[] };
type InvitationsResponse = { data: TenantInvitation[] };

type UpdateUserResponse = {
  ok: boolean;
  data: {
    uid: string;
    role: TenantRole;
    tenantId: string;
  };
};

type CreateInvitationResponse = {
  data: TenantInvitation;
  inviteUrl: string | null;
  sent: boolean;
  autoAssigned?: boolean;
};

type PendingUserChange = {
  uid: string;
  email: string | null;
  role: TenantRole;
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
  const [invitations, setInvitations] = useState<TenantInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | TenantRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "invited" | "revoked">("all");
  const [drafts, setDrafts] = useState<Record<string, TenantRole>>({});
  const [pendingChange, setPendingChange] = useState<PendingUserChange | null>(null);

  const [inviteDrawerOpen, setInviteDrawerOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TenantRole>("viewer");

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const queryString = toQueryParams({
        q: query.trim() || null,
        role: roleFilter === "all" ? null : roleFilter,
        status: statusFilter === "all" ? null : statusFilter
      });
      const response = await api.get<UsersResponse>(`/api/tenant/users?${queryString}`);
      setUsers(response.data);
      setDrafts(
        Object.fromEntries(
          response.data.map((user) => [user.uid, user.role])
        ) as Record<string, TenantRole>
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar usuarios del tenant.");
    } finally {
      setLoadingUsers(false);
    }
  }, [api, query, roleFilter, statusFilter]);

  const loadInvitations = useCallback(async () => {
    setLoadingInvitations(true);
    try {
      const response = await api.get<InvitationsResponse>("/api/tenant/invitations");
      setInvitations(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar invitaciones.");
    } finally {
      setLoadingInvitations(false);
    }
  }, [api]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  const selectedUser = useMemo(
    () => (pendingChange ? users.find((user) => user.uid === pendingChange.uid) || null : null),
    [pendingChange, users]
  );

  return (
    <ModulePage
      title="Administracion de usuarios del ambiente"
      description="Gestiona roles de tu empresa e invita nuevos usuarios al tenant."
    >
      <Toast message={toast?.message || null} tone={toast?.tone || "info"} />

      <ModuleActionBar>
        <button className="btn-primary" type="button" onClick={() => setInviteDrawerOpen(true)}>
          Invitar usuario
        </button>
      </ModuleActionBar>

      <Panel title="Filtros">
        <div className="toolbar">
          <label>
            Buscar (email/uid)
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="usuario@empresa.com"
            />
          </label>
          <label>
            Rol
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | TenantRole)}>
              <option value="all">Todos</option>
              {TENANT_MEMBER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {getTenantRoleLabel(role)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estado
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">Todos</option>
              <option value="active">active</option>
              <option value="invited">invited</option>
              <option value="revoked">revoked</option>
            </select>
          </label>
          <button className="btn-secondary" type="button" onClick={() => void loadUsers()}>
            Aplicar
          </button>
        </div>
        <InlineError message={error} />
      </Panel>

      <Panel title="Usuarios del tenant">
        {loadingUsers ? <SkeletonRows rows={6} /> : null}
        {!loadingUsers && users.length === 0 ? <EmptyState message="No hay usuarios para este tenant." /> : null}
        {!loadingUsers && users.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>UID</th>
                  <th>Ultimo acceso</th>
                  <th>Estado</th>
                  <th>Rol</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const draftRole = drafts[user.uid] || user.role;
                  const changed = draftRole !== user.role;
                  return (
                    <tr key={user.uid}>
                      <td>{user.email || "Sin email"}</td>
                      <td>{user.uid}</td>
                      <td>{user.lastSignInTime || "Sin acceso"}</td>
                      <td>{user.status || (user.disabled ? "disabled" : "active")}</td>
                      <td>
                        <select
                          value={draftRole}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [user.uid]: event.target.value as TenantRole
                            }))
                          }
                        >
                          {TENANT_MEMBER_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {getTenantRoleLabel(role)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          className="btn-primary"
                          type="button"
                          disabled={!changed || saving}
                          onClick={() =>
                            setPendingChange({
                              uid: user.uid,
                              email: user.email,
                              role: draftRole
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

      <Panel title="Invitaciones">
        {loadingInvitations ? <SkeletonRows rows={4} /> : null}
        {!loadingInvitations && invitations.length === 0 ? (
          <EmptyState message="No hay invitaciones registradas." />
        ) : null}
        {!loadingInvitations && invitations.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Expira</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td>{invitation.email}</td>
                    <td>{getTenantRoleLabel(invitation.role)}</td>
                    <td>{invitation.status}</td>
                    <td>{invitation.expiresAt}</td>
                    <td style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => {
                          setSaving(true);
                          void api
                            .patch<{ ok: boolean; inviteUrl: string; sent: boolean }>("/api/tenant/invitations", {
                              id: invitation.id,
                              action: "resend"
                            })
                            .then((response) => {
                              if (response.inviteUrl) {
                                void navigator.clipboard?.writeText(response.inviteUrl);
                              }
                              setToast({
                                message: response.sent
                                  ? "Invitacion reenviada y link copiado."
                                  : "Invitacion renovada. Link copiado.",
                                tone: "success"
                              });
                              return loadInvitations();
                            })
                            .catch((err) => {
                              setToast({
                                message: err instanceof Error ? err.message : "No se pudo reenviar invitacion.",
                                tone: "error"
                              });
                            })
                            .finally(() => setSaving(false));
                        }}
                        disabled={saving}
                      >
                        Reenviar
                      </button>
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => {
                          setSaving(true);
                          void api
                            .patch<{ ok: boolean }>("/api/tenant/invitations", {
                              id: invitation.id,
                              action: "revoke"
                            })
                            .then(() => {
                              setToast({ message: "Invitacion revocada.", tone: "info" });
                              return loadInvitations();
                            })
                            .catch((err) => {
                              setToast({
                                message: err instanceof Error ? err.message : "No se pudo revocar invitacion.",
                                tone: "error"
                              });
                            })
                            .finally(() => setSaving(false));
                        }}
                        disabled={saving || invitation.status !== "pending"}
                      >
                        Revocar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      <FormDrawer
        isOpen={Boolean(pendingChange)}
        title="Confirmar cambio de rol"
        description="Se actualizara el rol de este usuario dentro de tu tenant."
        onClose={() => setPendingChange(null)}
      >
        {pendingChange ? (
          <>
            <p>
              Usuario <strong>{pendingChange.email || pendingChange.uid}</strong> pasara a rol{" "}
              <strong>{getTenantRoleLabel(pendingChange.role)}</strong>.
            </p>
            <div className="toolbar">
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
                  void api
                    .patch<UpdateUserResponse>("/api/tenant/users", {
                      uid: pendingChange.uid,
                      role: pendingChange.role
                    })
                    .then(() => {
                      setToast({ message: "Rol actualizado.", tone: "success" });
                      setPendingChange(null);
                      return loadUsers();
                    })
                    .catch((err) => {
                      setToast({
                        message: err instanceof Error ? err.message : "No se pudo actualizar rol.",
                        tone: "error"
                      });
                    })
                    .finally(() => setSaving(false));
                }}
              >
                Confirmar
              </button>
            </div>
            {selectedUser?.role !== pendingChange.role ? (
              <p className="inline-error">El usuario debera refrescar token para tomar permisos nuevos.</p>
            ) : null}
          </>
        ) : null}
      </FormDrawer>

      <FormDrawer
        isOpen={inviteDrawerOpen}
        title="Invitar usuario al tenant"
        description="Se enviara un enlace de acceso por email y se copiara el link en pantalla."
        onClose={() => setInviteDrawerOpen(false)}
      >
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setSaving(true);
            void api
              .post<CreateInvitationResponse>("/api/tenant/invitations", {
                email: inviteEmail,
                role: inviteRole
              })
              .then((response) => {
                if (response.inviteUrl) {
                  void navigator.clipboard?.writeText(response.inviteUrl);
                }
                setToast({
                  message: response.autoAssigned
                    ? "Usuario existente asignado directamente al tenant."
                    : response.sent
                      ? "Invitacion enviada y link copiado."
                      : "Invitacion creada. Link copiado para compartir.",
                  tone: "success"
                });
                setInviteDrawerOpen(false);
                setInviteEmail("");
                setInviteRole("viewer");
                return Promise.all([loadInvitations(), loadUsers()]);
              })
              .catch((err) => {
                setToast({
                  message: err instanceof Error ? err.message : "No se pudo crear invitacion.",
                  tone: "error"
                });
              })
              .finally(() => setSaving(false));
          }}
        >
          <label>
            Email
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Rol
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as TenantRole)}
            >
              {TENANT_MEMBER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {getTenantRoleLabel(role)}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button className="btn-secondary" type="button" onClick={() => setInviteDrawerOpen(false)} disabled={saving}>
              Cancelar
            </button>
            <button className="btn-primary" type="submit" disabled={saving}>
              Crear invitacion
            </button>
          </div>
        </form>
      </FormDrawer>
    </ModulePage>
  );
}
