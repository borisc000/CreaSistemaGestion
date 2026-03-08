"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";

export function LoginCard() {
  const { user, loading, role, needsOnboarding, signInWithGoogle, signInWithEmailPassword, registerWithEmailPassword } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if (role === "platform_admin") {
        router.replace("/configuraciones/plataforma");
        return;
      }
      router.replace(needsOnboarding ? "/onboarding" : "/dashboard");
    }
  }, [loading, user, role, needsOnboarding, router]);

  async function runAuth(action: "login" | "register") {
    setBusy(true);
    setError(null);
    try {
      if (action === "login") {
        await signInWithEmailPassword(email.trim(), password);
      } else {
        await registerWithEmailPassword(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo autenticar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="login-card">
      <h1>Sistema Gestion Contratistas</h1>
      <p>Accede con Google o email/password para operar tu ambiente SaaS.</p>
      <button
        className="btn-primary"
        onClick={() => {
          setBusy(true);
          setError(null);
          void signInWithGoogle()
            .catch((err) => {
              setError(err instanceof Error ? err.message : "No se pudo iniciar sesion.");
            })
            .finally(() => setBusy(false));
        }}
        type="button"
        disabled={busy}
      >
        Ingresar con Google
      </button>

      <div className="form-grid">
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="usuario@empresa.com" />
        </label>
        <label>
          Contrasena
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="********" />
        </label>
        <div className="form-actions">
          <button className="btn-secondary" type="button" disabled={busy || !email || !password} onClick={() => void runAuth("login")}>
            Ingresar email
          </button>
          <button className="btn-secondary" type="button" disabled={busy || !email || !password} onClick={() => void runAuth("register")}>
            Crear cuenta
          </button>
        </div>
      </div>

      {error ? <small className="inline-error">{error}</small> : null}
      <small>Si no tienes empresa asignada, al entrar se abrira el onboarding para crear tu ambiente.</small>
    </section>
  );
}
