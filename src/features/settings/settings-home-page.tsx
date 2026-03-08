"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { buildSettingsTabs } from "@/features/settings/settings-tabs";

export function SettingsHomePage() {
  const router = useRouter();
  const { tenantId, moduleAccess } = useAuth();

  useEffect(() => {
    const tabs = buildSettingsTabs({ tenantId, moduleAccess }).filter((tab) => tab.visible);
    const fallback = tenantId ? "/dashboard" : "/configuraciones/plataforma";
    router.replace(tabs[0]?.href || fallback);
  }, [moduleAccess, router, tenantId]);

  return <div className="screen-center">Cargando configuraciones...</div>;
}
