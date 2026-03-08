"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { ModulePage } from "@/features/modules/module-ui";
import { buildSettingsTabs, type SettingsTabKey } from "@/features/settings/settings-tabs";

export function SettingsShell({
  activeTab,
  children
}: {
  activeTab: SettingsTabKey;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { tenantId, moduleAccess } = useAuth();
  const tabs = buildSettingsTabs({ tenantId, moduleAccess }).filter((tab) => tab.visible);

  return (
    <ModulePage
      title="Configuraciones"
      description="Gestion centralizada de usuarios, permisos, auditoria, empresa y plataforma."
    >
      <div className="module-tabs" role="tablist" aria-label="Configuraciones tabs">
        {tabs.map((tab) => {
          const active = activeTab === tab.key || pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link className={`tab-btn ${active ? "is-active" : ""}`} href={tab.href} key={tab.key}>
              {tab.label}
            </Link>
          );
        })}
      </div>
      {children}
    </ModulePage>
  );
}
