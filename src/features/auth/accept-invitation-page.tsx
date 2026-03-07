"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApiClient } from "@/lib/api/use-api-client";
import { useAuth } from "@/features/auth/auth-provider";
import { InlineError, ModulePage, Panel, Toast } from "@/features/modules/module-ui";
import type { TenantRecord, TenantUserMembership } from "@/types/domain";

type AcceptInvitationResponse = {
  data: {
    tenant: TenantRecord;
    membership: TenantUserMembership;
    redirectUrl: string;
  };
};

export function AcceptInvitationPage() {
  const params = useSearchParams();
  const api = useApiClient();
  const { refreshClaims } = useAuth();
  const defaultToken = useMemo(() => params.get("token") || "", [params]);

  const [token, setToken] = useState(defaultToken);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <ModulePage
      title="Aceptar invitacion"
      description="Valida tu acceso al tenant con el enlace recibido por email."
    >
      <Toast message={toast} tone="success" />
      <Panel title="Confirmar invitacion">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setSaving(true);
            void api
              .post<AcceptInvitationResponse>("/api/auth/accept-invitation", { token })
              .then(async (response) => {
                await refreshClaims();
                setToast(`Invitacion aceptada. Redirigiendo a ${response.data.tenant.name}...`);
                window.location.href = response.data.redirectUrl;
              })
              .catch((err) => {
                setError(err instanceof Error ? err.message : "No se pudo aceptar invitacion.");
              })
              .finally(() => setSaving(false));
          }}
        >
          <label>
            Token de invitacion
            <input value={token} onChange={(event) => setToken(event.target.value)} required />
          </label>
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={saving || token.trim().length < 12}>
              Aceptar invitacion
            </button>
          </div>
          <InlineError message={error} />
        </form>
      </Panel>
    </ModulePage>
  );
}
