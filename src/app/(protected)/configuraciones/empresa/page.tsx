import { SettingsCompanyPage } from "@/features/settings/settings-company-page";
import { SettingsShell } from "@/features/settings/settings-shell";

export default function SettingsCompanyRoute() {
  return (
    <SettingsShell activeTab="empresa">
      <SettingsCompanyPage />
    </SettingsShell>
  );
}
