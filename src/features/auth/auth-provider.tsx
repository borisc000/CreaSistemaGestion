"use client";

import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { parsePlatformRole, parseTenantRole, resolveEffectiveRole } from "@/lib/auth/roles";
import { firebaseAuth } from "@/lib/firebase/client";
import type { TenantRecord, TenantScopedRole, UserRole, UserTenantMembershipView } from "@/types/domain";

type AuthContextPayload = {
  data: {
    onboardingRequired: boolean;
    roles: {
      effectiveRole: UserRole;
      tenantRole: TenantScopedRole | null;
      platformRole: "platform_admin" | null;
    };
    tenant: TenantRecord | null;
    memberships: UserTenantMembershipView[];
  };
};

type SwitchTenantResponse = {
  data: {
    redirectUrl: string;
  };
};

type AuthState = {
  user: User | null;
  loading: boolean;
  idToken: string | null;
  role: UserRole;
  tenantRole: TenantScopedRole | null;
  platformRole: "platform_admin" | null;
  tenantId: string | null;
  memberships: UserTenantMembershipView[];
  needsOnboarding: boolean;
  switchingTenant: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmailPassword: (email: string, password: string) => Promise<void>;
  registerWithEmailPassword: (email: string, password: string) => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshClaims: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function parseClaims(claims: Record<string, unknown>) {
  const parsedTenantRole = parseTenantRole(claims.tenantRole ?? claims.role);
  const platformRole = parsePlatformRole(claims.platformRole);
  const role = resolveEffectiveRole({
    tenantRole: claims.tenantRole,
    role: claims.role,
    platformRole: claims.platformRole
  });
  const tenantId = typeof claims.tenantId === "string" ? claims.tenantId : null;
  return {
    role,
    tenantRole: platformRole ? null : parsedTenantRole,
    platformRole,
    tenantId
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>("viewer");
  const [tenantRole, setTenantRole] = useState<TenantScopedRole | null>("viewer");
  const [platformRole, setPlatformRole] = useState<"platform_admin" | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<UserTenantMembershipView[]>([]);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [switchingTenant, setSwitchingTenant] = useState(false);

  const loadAuthContext = useCallback(async (token: string) => {
    const response = await fetch("/api/auth/context", {
      headers: {
        Authorization: `Bearer ${token}`
      },
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error("No se pudo cargar el contexto de autenticacion.");
    }
    const payload = (await response.json()) as AuthContextPayload;
    const context = payload.data;
    setRole(context.roles.effectiveRole);
    setTenantRole(context.roles.tenantRole);
    setPlatformRole(context.roles.platformRole);
    setTenantId(context.tenant?.id || context.memberships[0]?.tenantId || null);
    setMemberships(context.memberships || []);
    setNeedsOnboarding(context.onboardingRequired);
  }, []);

  const refreshClaims = useCallback(async () => {
    if (!user) return;
    const [token, tokenResult] = await Promise.all([user.getIdToken(true), user.getIdTokenResult(true)]);
    const claims = parseClaims(tokenResult.claims as Record<string, unknown>);
    setIdToken(token);
    setRole(claims.role);
    setTenantRole(claims.tenantRole);
    setPlatformRole(claims.platformRole);
    setTenantId(claims.tenantId);

    try {
      await loadAuthContext(token);
    } catch {
      setNeedsOnboarding(false);
      setMemberships([]);
    }
  }, [loadAuthContext, user]);

  useEffect(() => {
    if (!firebaseAuth) {
      setLoading(false);
      return;
    }

    const unsub = onIdTokenChanged(firebaseAuth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setIdToken(null);
        setRole("viewer");
        setTenantRole("viewer");
        setPlatformRole(null);
        setTenantId(null);
        setMemberships([]);
        setNeedsOnboarding(false);
        setLoading(false);
        return;
      }

      const [token, tokenResult] = await Promise.all([nextUser.getIdToken(), nextUser.getIdTokenResult()]);
      const claims = parseClaims(tokenResult.claims as Record<string, unknown>);
      setIdToken(token);
      setRole(claims.role);
      setTenantRole(claims.tenantRole);
      setPlatformRole(claims.platformRole);
      setTenantId(claims.tenantId);
      setNeedsOnboarding(false);
      try {
        await loadAuthContext(token);
      } catch {
        setMemberships([]);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [loadAuthContext]);

  const signInWithGoogle = useCallback(async () => {
    if (!firebaseAuth) {
      throw new Error("Firebase Auth is not configured. Check NEXT_PUBLIC_FIREBASE_* env vars.");
    }
    const provider = new GoogleAuthProvider();
    await signInWithPopup(firebaseAuth, provider);
  }, []);

  const signInWithEmailPassword = useCallback(async (email: string, password: string) => {
    if (!firebaseAuth) {
      throw new Error("Firebase Auth is not configured. Check NEXT_PUBLIC_FIREBASE_* env vars.");
    }
    await signInWithEmailAndPassword(firebaseAuth, email, password);
  }, []);

  const registerWithEmailPassword = useCallback(async (email: string, password: string) => {
    if (!firebaseAuth) {
      throw new Error("Firebase Auth is not configured. Check NEXT_PUBLIC_FIREBASE_* env vars.");
    }
    await createUserWithEmailAndPassword(firebaseAuth, email, password);
  }, []);

  const switchTenant = useCallback(
    async (nextTenantId: string) => {
      if (!idToken) {
        throw new Error("No hay token de sesion disponible.");
      }
      setSwitchingTenant(true);
      try {
        const response = await fetch("/api/auth/switch-tenant", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ tenantId: nextTenantId })
        });
        const payload = (await response.json()) as SwitchTenantResponse | { error?: string };
        if (!response.ok) {
          throw new Error((payload as { error?: string }).error || "No se pudo cambiar de ambiente.");
        }
        await refreshClaims();

        const redirectUrl = (payload as SwitchTenantResponse).data.redirectUrl;
        if (typeof window !== "undefined" && redirectUrl) {
          const next = new URL(redirectUrl, window.location.origin);
          if (next.host !== window.location.host) {
            window.location.href = redirectUrl;
          }
        }
      } finally {
        setSwitchingTenant(false);
      }
    },
    [idToken, refreshClaims]
  );

  const logout = useCallback(async () => {
    if (!firebaseAuth) return;
    await signOut(firebaseAuth);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      idToken,
      role,
      tenantRole,
      platformRole,
      tenantId,
      memberships,
      needsOnboarding,
      switchingTenant,
      signInWithGoogle,
      signInWithEmailPassword,
      registerWithEmailPassword,
      switchTenant,
      refreshClaims,
      logout
    }),
    [
      user,
      loading,
      idToken,
      role,
      tenantRole,
      platformRole,
      tenantId,
      memberships,
      needsOnboarding,
      switchingTenant,
      signInWithGoogle,
      signInWithEmailPassword,
      registerWithEmailPassword,
      switchTenant,
      refreshClaims,
      logout
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return ctx;
}
