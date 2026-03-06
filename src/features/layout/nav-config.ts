import type { ModuleKey, UserRole } from "@/types/domain";

export type NavItem = {
  label: string;
  href: string;
  moduleKey?: ModuleKey;
  children?: NavItem[];
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", moduleKey: "dashboard" },
  { label: "Licitaciones", href: "/licitaciones", moduleKey: "tenders" },
  { label: "Contratos", href: "/contratos", moduleKey: "contracts" },
  { label: "Operaciones", href: "/operaciones", moduleKey: "operations" },
  { label: "Finanzas", href: "/finanzas", moduleKey: "finance" },
  {
    label: "RRHH",
    href: "/rrhh",
    children: [
      { label: "Reclutamiento y seleccion", href: "/rrhh/reclutamiento", moduleKey: "hr_recruiting" },
      { label: "Gestion de personas", href: "/rrhh/personas", moduleKey: "hr_people" }
    ]
  }
];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  tender_lead: "Lider Licitaciones",
  contract_manager: "Contract Manager",
  finance: "Analista Finanzas",
  hr: "Lider RRHH",
  viewer: "Solo lectura"
};
