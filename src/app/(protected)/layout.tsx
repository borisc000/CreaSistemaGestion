import { AppShell } from "@/features/layout/app-shell";
import { AuthGuard } from "@/features/auth/auth-guard";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
