"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getTenantRoleLabel } from "@/lib/auth/roles";
import { useAuth } from "@/features/auth/auth-provider";
import { NAV_ITEMS, ROLE_LABELS } from "@/features/layout/nav-config";
import { resolveModuleKeyFromPath } from "@/modules/registry";
import { canViewModule } from "@/server/auth/roles";

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    role,
    logout,
    user,
    tenantId,
    memberships,
    switchTenant,
    switchingTenant,
    needsOnboarding
  } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState(tenantId || "");
  const routeModule = resolveModuleKeyFromPath(pathname);
  const hasTenantEnvironment = Boolean(tenantId);
  const hasAccessByRole = routeModule ? canViewModule(role, routeModule) : true;
  const hasAccess =
    hasAccessByRole &&
    (!routeModule || routeModule === "platform" || routeModule === "dashboard" || hasTenantEnvironment || needsOnboarding);

  const items = needsOnboarding
    ? []
    : NAV_ITEMS.filter((item) => {
        if (!item.children) {
          if (role === "platform_admin" && !hasTenantEnvironment && item.moduleKey && item.moduleKey !== "platform") {
            return false;
          }
          return item.moduleKey ? canViewModule(role, item.moduleKey) : true;
        }

        return item.children.some((child) => {
          if (!child.moduleKey) return true;
          if (role === "platform_admin" && !hasTenantEnvironment && child.moduleKey !== "platform") {
            return false;
          }
          return canViewModule(role, child.moduleKey);
        });
      });

  const currentMembership = useMemo(
    () => memberships.find((membership) => membership.tenantId === tenantId) || null,
    [memberships, tenantId]
  );

  useEffect(() => {
    setSelectedTenantId(tenantId || memberships[0]?.tenantId || "");
  }, [tenantId, memberships]);

  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="app-root">
      <aside className={`side-nav ${menuOpen ? "is-open" : ""}`} id="main-nav">
        <div className="brand">Crea Sistema Gestion</div>
        {items.map((item) => {
          const activeRoot = isActive(pathname, item.href);
          if (!item.children) {
            return (
              <Link className={`nav-item ${activeRoot ? "is-active" : ""}`} href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>
                {item.label}
              </Link>
            );
          }

          return (
            <section className={`nav-group ${activeRoot ? "is-active" : ""}`} key={item.label}>
              <p className="nav-group-title">{item.label}</p>
              {item.children
                .filter((child) => {
                  if (!child.moduleKey) return true;
                  if (role === "platform_admin" && !hasTenantEnvironment && child.moduleKey !== "platform") {
                    return false;
                  }
                  return canViewModule(role, child.moduleKey);
                })
                .map((child) => {
                  const activeChild = isActive(pathname, child.href);
                  return (
                    <Link
                      className={`nav-subitem ${activeChild ? "is-active" : ""}`}
                      href={child.href}
                      key={child.href}
                      onClick={() => setMenuOpen(false)}
                    >
                      {child.label}
                    </Link>
                  );
                })}
            </section>
          );
        })}
      </aside>

      <div className="main-layer">
        <header className="topbar">
          <button
            className="menu-btn"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            aria-controls="main-nav"
          >
            <span />
            <span />
            <span />
          </button>
          <div className="topbar-meta">
            <strong>{ROLE_LABELS[role]}</strong>
            <span>{user?.email || "Sin email"}</span>
            <span>{currentMembership ? `${currentMembership.tenantName} (${currentMembership.tenantSlug})` : tenantId || "Sin tenant"}</span>
          </div>
          <div className="topbar-actions">
            {memberships.length > 0 ? (
              <div className="topbar-tenant-switch">
                <label htmlFor="tenant-switch-select">Ambiente</label>
                <select
                  id="tenant-switch-select"
                  value={selectedTenantId}
                  onChange={(event) => setSelectedTenantId(event.target.value)}
                  disabled={switchingTenant}
                >
                  {memberships.map((membership) => (
                    <option key={membership.tenantId} value={membership.tenantId}>
                      {membership.tenantName} ({getTenantRoleLabel(membership.membershipRole)})
                    </option>
                  ))}
                </select>
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={switchingTenant || !selectedTenantId || selectedTenantId === tenantId}
                  onClick={() => {
                    void switchTenant(selectedTenantId);
                  }}
                >
                  {switchingTenant ? "Cambiando..." : "Cambiar"}
                </button>
              </div>
            ) : null}
            {role === "platform_admin" ? (
              <Link className="btn-secondary" href="/platform">
                Gestionar empresas
              </Link>
            ) : null}
            {role === "tenant_admin" || role === "platform_admin" ? (
              <Link className="pill" href="/auditoria">
                Auditoria
              </Link>
            ) : null}
            <button className="btn-secondary" onClick={() => logout()} type="button">
              Cerrar sesion
            </button>
          </div>
        </header>

        {menuOpen ? <button className="overlay" onClick={() => setMenuOpen(false)} type="button" aria-label="Cerrar menu" /> : null}

        <main className="page-content">
          {hasAccess ? (
            children
          ) : (
            <section className="panel">
              <h2>Sin acceso a este modulo</h2>
              <p>
                {role === "platform_admin" && !hasTenantEnvironment
                  ? "Selecciona un ambiente de empresa o crea uno nuevo para abrir modulos operativos."
                  : "Tu rol actual no tiene permisos para esta seccion."}
              </p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
