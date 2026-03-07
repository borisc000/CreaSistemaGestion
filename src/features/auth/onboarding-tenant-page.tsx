"use client";

import { useState } from "react";
import { useApiClient } from "@/lib/api/use-api-client";
import { useAuth } from "@/features/auth/auth-provider";
import { InlineError, ModulePage, Panel, Toast } from "@/features/modules/module-ui";
import type { TenantRecord } from "@/types/domain";

type OnboardingResponse = {
  data: {
    tenant: TenantRecord;
    redirectUrl: string;
  };
};

export function OnboardingTenantPage() {
  const api = useApiClient();
  const { refreshClaims } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <ModulePage
      title="Crear empresa"
      description="Crea una nueva empresa/ambiente. Tu usuario puede pertenecer a mas de un tenant."
    >
      <Toast message={toast} tone="success" />
      <Panel title="Onboarding de tenant">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setSaving(true);
            setError(null);
            void api
              .post<OnboardingResponse>("/api/onboarding/tenant", {
                name,
                slug: slug || undefined
              })
              .then(async (response) => {
                await refreshClaims();
                setToast(`Empresa creada. Redirigiendo a ${response.data.redirectUrl}`);
                window.location.href = response.data.redirectUrl;
              })
              .catch((err) => {
                setError(err instanceof Error ? err.message : "No se pudo crear la empresa.");
              })
              .finally(() => setSaving(false));
          }}
        >
          <label>
            Nombre de empresa
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Wolotec SpA" required />
          </label>
          <label>
            Slug
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="wolotec"
            />
          </label>
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={saving || !name.trim()}>
              Crear empresa
            </button>
          </div>
          <InlineError message={error} />
        </form>
      </Panel>
    </ModulePage>
  );
}
