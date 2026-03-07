"use client";

import { useCallback, useEffect, useState } from "react";
import { TENANT_MEMBER_ROLES, getTenantRoleLabel, type TenantRole } from "@/lib/auth/roles";
import { useApiClient } from "@/lib/api/use-api-client";
import { InlineError, ModulePage, Panel, SkeletonRows, Toast } from "@/features/modules/module-ui";
import type { BillingPlanCode, TenantDomain, TenantRecord } from "@/types/domain";

type TenantsResponse = { data: TenantRecord[] };
type DomainsResponse = { data: TenantDomain[] };

export function PlatformConsolePage() {
  const api = useApiClient();
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [planCode, setPlanCode] = useState<BillingPlanCode>("starter");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerRole, setOwnerRole] = useState<TenantRole>("tenant_admin");

  const [assignTenantId, setAssignTenantId] = useState("");
  const [assignEmail, setAssignEmail] = useState("");
  const [assignRole, setAssignRole] = useState<TenantRole>("tenant_manager");

  const [domainTenantId, setDomainTenantId] = useState("");
  const [domainHost, setDomainHost] = useState("");
  const [domainType, setDomainType] = useState<"custom" | "wildcard">("custom");
  const [saving, setSaving] = useState(false);

  const loadTenants = useCallback(async () => {
    setLoadingTenants(true);
    try {
      const response = await api.get<TenantsResponse>("/api/platform/tenants");
      setTenants(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar tenants.");
    } finally {
      setLoadingTenants(false);
    }
  }, [api]);

  const loadDomains = useCallback(async () => {
    setLoadingDomains(true);
    try {
      const response = await api.get<DomainsResponse>("/api/platform/domains");
      setDomains(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar dominios.");
    } finally {
      setLoadingDomains(false);
    }
  }, [api]);

  useEffect(() => {
    void loadTenants();
    void loadDomains();
  }, [loadTenants, loadDomains]);

  return (
    <ModulePage
      title="Consola de plataforma"
      description="Operacion global SaaS: tenants, dominios y configuracion de plan."
    >
      <Toast message={toast?.message || null} tone={toast?.tone || "info"} />
      <InlineError message={error} />

      <Panel title="Crear tenant">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setSaving(true);
            void api
              .post<{ data: TenantRecord }>("/api/platform/tenants", {
                name,
                slug,
                planCode,
                ownerEmail,
                ownerRole
              })
              .then((response) => {
                setToast({ message: `Tenant ${response.data.slug} creado.`, tone: "success" });
                setName("");
                setSlug("");
                setOwnerEmail("");
                setOwnerRole("tenant_admin");
                return loadTenants();
              })
              .catch((err) => {
                setToast({ message: err instanceof Error ? err.message : "No se pudo crear tenant.", tone: "error" });
              })
              .finally(() => setSaving(false));
          }}
        >
          <label>
            Nombre
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Slug
            <input value={slug} onChange={(event) => setSlug(event.target.value)} required />
          </label>
          <label>
            Plan
            <select value={planCode} onChange={(event) => setPlanCode(event.target.value as BillingPlanCode)}>
              <option value="starter">starter</option>
              <option value="pro">pro</option>
              <option value="enterprise">enterprise</option>
            </select>
          </label>
          <label>
            Owner email
            <input type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} required />
          </label>
          <label>
            Rol inicial
            <select value={ownerRole} onChange={(event) => setOwnerRole(event.target.value as TenantRole)}>
              {TENANT_MEMBER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {getTenantRoleLabel(role)}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={saving}>
              Crear tenant
            </button>
          </div>
        </form>
      </Panel>

      <Panel title="Asignar usuario a empresa">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setSaving(true);
            void api
              .patch<{ ok: boolean }>("/api/platform/tenants", {
                id: assignTenantId,
                action: "assign_user",
                email: assignEmail,
                role: assignRole
              })
              .then(() => {
                setToast({ message: `Usuario ${assignEmail} asignado a ${assignTenantId}.`, tone: "success" });
                setAssignTenantId("");
                setAssignEmail("");
                setAssignRole("tenant_manager");
                return loadTenants();
              })
              .catch((err) => {
                setToast({ message: err instanceof Error ? err.message : "No se pudo asignar usuario.", tone: "error" });
              })
              .finally(() => setSaving(false));
          }}
        >
          <label>
            Tenant ID
            <input value={assignTenantId} onChange={(event) => setAssignTenantId(event.target.value)} required />
          </label>
          <label>
            Email usuario
            <input type="email" value={assignEmail} onChange={(event) => setAssignEmail(event.target.value)} required />
          </label>
          <label>
            Rol
            <select value={assignRole} onChange={(event) => setAssignRole(event.target.value as TenantRole)}>
              {TENANT_MEMBER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {getTenantRoleLabel(role)}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={saving}>
              Asignar usuario
            </button>
          </div>
        </form>
      </Panel>

      <Panel title="Tenants">
        {loadingTenants ? <SkeletonRows rows={4} /> : null}
        {!loadingTenants ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th>Plan</th>
                  <th>Max users</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td>{tenant.id}</td>
                    <td>{tenant.name}</td>
                    <td>{tenant.status}</td>
                    <td>{tenant.plan.code}</td>
                    <td>{tenant.plan.limits.maxUsers}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn-secondary"
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            setSaving(true);
                            void api
                              .patch<{ ok: boolean }>("/api/platform/tenants", {
                                id: tenant.id,
                                status: tenant.status === "active" ? "suspended" : "active"
                              })
                              .then(() => {
                                setToast({
                                  message: `Tenant ${tenant.status === "active" ? "suspendido" : "activado"}.`,
                                  tone: "info"
                                });
                                return loadTenants();
                              })
                              .catch((err) => {
                                setToast({
                                  message: err instanceof Error ? err.message : "No se pudo actualizar tenant.",
                                  tone: "error"
                                });
                              })
                              .finally(() => setSaving(false));
                          }}
                        >
                          {tenant.status === "active" ? "Suspender" : "Activar"}
                        </button>
                        <button
                          className="btn-danger"
                          type="button"
                          disabled={saving || tenant.status !== "suspended"}
                          onClick={() => {
                            const confirmation = window.prompt(
                              `Escribe el slug "${tenant.slug}" para eliminar definitivamente el tenant ${tenant.id}.`
                            );
                            if (!confirmation) {
                              return;
                            }

                            setSaving(true);
                            void api
                              .patch<{ ok: boolean }>("/api/platform/tenants", {
                                id: tenant.id,
                                action: "delete",
                                confirmSlug: confirmation
                              })
                              .then(() => {
                                setToast({ message: `Tenant ${tenant.id} eliminado.`, tone: "info" });
                                return Promise.all([loadTenants(), loadDomains()]);
                              })
                              .catch((err) => {
                                setToast({
                                  message: err instanceof Error ? err.message : "No se pudo eliminar tenant.",
                                  tone: "error"
                                });
                              })
                              .finally(() => setSaving(false));
                          }}
                          title={tenant.status !== "suspended" ? "Debes suspender primero para eliminar." : undefined}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      <Panel title="Dominios tenant">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setSaving(true);
            void api
              .post<{ data: TenantDomain }>("/api/platform/domains", {
                tenantId: domainTenantId,
                host: domainHost,
                type: domainType
              })
              .then(() => {
                setToast({ message: "Dominio registrado.", tone: "success" });
                setDomainTenantId("");
                setDomainHost("");
                return loadDomains();
              })
              .catch((err) => {
                setToast({ message: err instanceof Error ? err.message : "No se pudo crear dominio.", tone: "error" });
              })
              .finally(() => setSaving(false));
          }}
        >
          <label>
            Tenant ID
            <input value={domainTenantId} onChange={(event) => setDomainTenantId(event.target.value)} required />
          </label>
          <label>
            Host
            <input value={domainHost} onChange={(event) => setDomainHost(event.target.value)} placeholder="acme.tu-dominio.com" required />
          </label>
          <label>
            Tipo
            <select value={domainType} onChange={(event) => setDomainType(event.target.value as "custom" | "wildcard")}>
              <option value="custom">custom</option>
              <option value="wildcard">wildcard</option>
            </select>
          </label>
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={saving}>
              Registrar dominio
            </button>
          </div>
        </form>

        {loadingDomains ? <SkeletonRows rows={4} /> : null}
        {!loadingDomains ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Tenant</th>
                  <th>Tipo</th>
                  <th>Verificado</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {domains.map((domain) => (
                  <tr key={domain.id}>
                    <td>{domain.host}</td>
                    <td>{domain.tenantId}</td>
                    <td>{domain.type}</td>
                    <td>{domain.verified ? "si" : "no"}</td>
                    <td>{domain.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>
    </ModulePage>
  );
}
