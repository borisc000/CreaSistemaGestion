"use client";

import { useCallback, useEffect, useState } from "react";
import { useApiClient } from "@/lib/api/use-api-client";

type ListResponse<T> = { data: T[] };

type PendingState = "idle" | "loading" | "saving";

export function useCrudModule<TItem>(endpoint: string) {
  const api = useApiClient();
  const [items, setItems] = useState<TItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<PendingState>("idle");

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const response = await api.get<ListResponse<TItem>>(endpoint);
      setItems(response.data);
      setState("idle");
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "No se pudo cargar informacion.");
    }
  }, [api, endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (payload: unknown): Promise<boolean> => {
      setState("saving");
      setError(null);
      try {
        await api.post(endpoint, payload);
        await load();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar.");
        return false;
      } finally {
        setState("idle");
      }
    },
    [api, endpoint, load]
  );

  const patch = useCallback(
    async (payload: unknown): Promise<boolean> => {
      setState("saving");
      setError(null);
      try {
        await api.patch(endpoint, payload);
        await load();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo actualizar.");
        return false;
      } finally {
        setState("idle");
      }
    },
    [api, endpoint, load]
  );

  return {
    items,
    error,
    pending: state,
    reload: load,
    create,
    patch
  };
}
