"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";

export function LoginCard() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  return (
    <section className="login-card">
      <h1>Sistema Gestion Contratistas</h1>
      <p>Accede con Google para trabajar con Auth + Firestore + Storage.</p>
      <button
        className="btn-primary"
        onClick={() => {
          void signInWithGoogle().catch((err) => {
            setError(err instanceof Error ? err.message : "No se pudo iniciar sesion.");
          });
        }}
        type="button"
      >
        Ingresar con Google
      </button>
      {error ? <small className="inline-error">{error}</small> : null}
      <small>
        El rol se toma desde custom claims. Si no tienes claims, quedaras como viewer hasta bootstrap de admin.
      </small>
    </section>
  );
}
