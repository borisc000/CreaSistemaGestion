import { AuditPage } from "@/features/audit/audit-page";
import { SettingsShell } from "@/features/settings/settings-shell";

export default function SettingsAuditRoute() {
  return (
    <SettingsShell activeTab="auditoria">
      <AuditPage hideModulePage />
    </SettingsShell>
  );
}
