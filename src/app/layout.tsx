import type { Metadata } from "next";
import "@/app/globals.css";
import { AuthProvider } from "@/features/auth/auth-provider";

export const metadata: Metadata = {
  title: "Crea Sistema Gestion",
  description: "MVP integral para gestion PyME contratistas con modulos RRHH, finanzas y operaciones."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
