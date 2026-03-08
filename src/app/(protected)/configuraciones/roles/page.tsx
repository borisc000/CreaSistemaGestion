import { SettingsRolesPage } from "@/features/settings/settings-roles-page";
import { SettingsShell } from "@/features/settings/settings-shell";

export default function SettingsRolesRoute() {
  return (
    <SettingsShell activeTab="roles">
      <SettingsRolesPage />
    </SettingsShell>
  );
}
