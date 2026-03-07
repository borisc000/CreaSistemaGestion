"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/features/auth/auth-provider";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, needsOnboarding, role, tenantId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const inOnboardingFlow = pathname === "/onboarding" || pathname.startsWith("/invitacion/aceptar");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }

    if (!loading && user && needsOnboarding && !inOnboardingFlow) {
      router.replace("/onboarding");
    }

    if (!loading && user && role === "platform_admin" && !tenantId && pathname === "/dashboard") {
      router.replace("/platform");
    }
  }, [loading, user, needsOnboarding, inOnboardingFlow, pathname, role, tenantId, router]);

  if (loading || !user) {
    return <div className="screen-center">Validando sesion...</div>;
  }

  if (needsOnboarding && !inOnboardingFlow) {
    return <div className="screen-center">Preparando onboarding...</div>;
  }

  return <>{children}</>;
}
