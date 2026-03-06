"use client";

import {
  GoogleAuthProvider,
  onIdTokenChanged,
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
import { firebaseAuth } from "@/lib/firebase/client";
import { DEFAULT_DEV_ROLE } from "@/lib/tenant";
import type { UserRole } from "@/types/domain";

type AuthState = {
  user: User | null;
  loading: boolean;
  idToken: string | null;
  role: UserRole;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function parseRole(value: unknown): UserRole {
  const role = typeof value === "string" ? value : DEFAULT_DEV_ROLE;
  if (["admin", "tender_lead", "contract_manager", "finance", "hr", "viewer"].includes(role)) {
    return role as UserRole;
  }
  return "viewer";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>(DEFAULT_DEV_ROLE);
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
        return;
      }

      const [token, tokenResult] = await Promise.all([nextUser.getIdToken(), nextUser.getIdTokenResult()]);
      setIdToken(token);
      setRole(parseRole(tokenResult.claims.role));
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!firebaseAuth) {
      throw new Error("Firebase Auth is not configured. Check NEXT_PUBLIC_FIREBASE_* env vars.");
    }
    const provider = new GoogleAuthProvider();
    await signInWithPopup(firebaseAuth, provider);
  }, []);

  const logout = useCallback(async () => {
    if (!firebaseAuth) return;
    await signOut(firebaseAuth);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, idToken, role, signInWithGoogle, logout }),
    [user, loading, idToken, role, signInWithGoogle, logout]
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
