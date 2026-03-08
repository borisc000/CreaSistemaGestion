import { UsersAdminPage } from "@/features/admin/users-admin-page";
import { SettingsShell } from "@/features/settings/settings-shell";

export default function SettingsUsersRoute() {
  return (
    <SettingsShell activeTab="usuarios">
      <UsersAdminPage hideModulePage />
    </SettingsShell>
  );
}
