"use client";

import type { ModuleAccessSnapshot, ModuleKey } from "@/types/domain";

export type SettingsTabKey = "usuarios" | "roles" | "auditoria" | "empresa" | "plataforma";

export type SettingsTab = {
  key: SettingsTabKey;
  label: string;
  href: string;
  moduleKey: ModuleKey;
  visible: boolean;
};

function canRead(moduleAccess: Partial<Record<ModuleKey, ModuleAccessSnapshot>>, moduleKey: ModuleKey): boolean {
  return Boolean(moduleAccess[moduleKey]?.read);
}

export function buildSettingsTabs(input: {
  tenantId: string | null;
  moduleAccess: Partial<Record<ModuleKey, ModuleAccessSnapshot>>;
}): SettingsTab[] {
  const usersVisible = canRead(input.moduleAccess, "admin_users");
  const auditVisible = canRead(input.moduleAccess, "audit");
  const platformVisible = canRead(input.moduleAccess, "platform");
  const companyVisible = usersVisible && Boolean(input.tenantId);

  return [
    {
      key: "usuarios",
      label: "Usuarios",
      href: "/configuraciones/usuarios",
      moduleKey: "admin_users",
      visible: usersVisible
    },
    {
      key: "roles",
      label: "Roles",
      href: "/configuraciones/roles",
      moduleKey: "platform",
      visible: platformVisible
    },
    {
      key: "auditoria",
      label: "Auditoria",
      href: "/configuraciones/auditoria",
      moduleKey: "audit",
      visible: auditVisible
    },
    {
      key: "empresa",
      label: "Empresa",
      href: "/configuraciones/empresa",
      moduleKey: "admin_users",
      visible: companyVisible
    },
    {
      key: "plataforma",
      label: "Plataforma",
      href: "/configuraciones/plataforma",
      moduleKey: "platform",
      visible: platformVisible
    }
  ];
}
