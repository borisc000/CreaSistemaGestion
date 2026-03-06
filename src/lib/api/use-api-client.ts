"use client";

import { useMemo } from "react";
import { useAuth } from "@/features/auth/auth-provider";

export function useApiClient() {
  const { idToken, role } = useAuth();

  return useMemo(() => {
    async function request<T>(path: string, init?: RequestInit): Promise<T> {
      const headers = new Headers(init?.headers || {});
      if (idToken) {
        headers.set("Authorization", `Bearer ${idToken}`);
      }

      const response = await fetch(path, {
        ...init,
        headers,
        cache: "no-store"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `Request failed with status ${response.status}.`);
      }

      return response.json() as Promise<T>;
    }

    return {
      role,
      get: <T,>(path: string) => request<T>(path),
      post: <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
      patch: <T,>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } })
    };
  }, [idToken, role]);
}