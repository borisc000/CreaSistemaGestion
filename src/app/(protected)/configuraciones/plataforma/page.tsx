import { PlatformConsolePage } from "@/features/platform/platform-console-page";
import { SettingsShell } from "@/features/settings/settings-shell";

export default function SettingsPlatformRoute() {
  return (
    <SettingsShell activeTab="plataforma">
      <PlatformConsolePage hideModulePage />
    </SettingsShell>
  );
}
