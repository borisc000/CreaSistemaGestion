import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import "@/app/globals.css";
import { AuthProvider } from "@/features/auth/auth-provider";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap"
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Crea Sistema Gestion",
  description: "MVP integral para gestion PyME contratistas con modulos RRHH, finanzas y operaciones."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${manrope.variable} ${sora.variable}`}>
        <div className="bg-shape bg-shape-a" aria-hidden />
        <div className="bg-shape bg-shape-b" aria-hidden />
        <div className="bg-shape bg-shape-c" aria-hidden />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
