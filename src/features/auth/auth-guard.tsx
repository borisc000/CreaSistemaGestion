"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/features/auth/auth-provider";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, role, tenantId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }

    if (!loading && user && role === "platform_admin" && !tenantId && pathname === "/dashboard") {
      router.replace("/platform");
    }
  }, [loading, user, pathname, role, tenantId, router]);

  if (loading || !user) {
    return <div className="screen-center">Validando sesion...</div>;
  }

  return <>{children}</>;
}
