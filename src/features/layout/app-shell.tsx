"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  const { role, logout, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const routeModule = resolveModuleKeyFromPath(pathname);
  const hasAccess = routeModule ? canViewModule(role, routeModule) : true;
  const items = NAV_ITEMS.filter((item) => {
    if (!item.children) {
      return item.moduleKey ? canViewModule(role, item.moduleKey) : true;
    }
    return item.children.some((child) => (child.moduleKey ? canViewModule(role, child.moduleKey) : true));
  });

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
                .filter((child) => (child.moduleKey ? canViewModule(role, child.moduleKey) : true))
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
          </div>
          <div className="topbar-actions">
            {role === "admin" ? (
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
              <p>Tu rol actual no tiene permisos para esta seccion.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
