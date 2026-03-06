import { getEnabledModules, type RegisteredModule } from "@/modules/registry";
import type { ModuleKey, UserRole } from "@/types/domain";

export type NavItem = {
  label: string;
  href: string;
  moduleKey?: ModuleKey;
  children?: NavItem[];
};

type FlatNavItem = {
  label: string;
  href: string;
  moduleKey: ModuleKey;
  order: number;
  groupLabel?: string;
  groupHref?: string;
  groupOrder?: number;
};

export function buildNavItemsFromModules(moduleDefinitions: readonly RegisteredModule[] = getEnabledModules()): NavItem[] {
  const flatNavItems: FlatNavItem[] = moduleDefinitions
    .filter((moduleDefinition) => moduleDefinition.enabled && Boolean(moduleDefinition.navigation))
    .map((moduleDefinition) => {
      const navigation = moduleDefinition.navigation!;
      return {
        label: navigation.label,
        href: navigation.href,
        moduleKey: moduleDefinition.moduleKey as ModuleKey,
        order: navigation.order,
        groupLabel: navigation.groupLabel,
        groupHref: navigation.groupHref,
        groupOrder: navigation.groupOrder
      };
    });

  const rootEntries: Array<{ order: number; item: NavItem }> = [];
  const groups = new Map<string, { label: string; href: string; order: number; children: Array<{ order: number; item: NavItem }> }>();

  for (const navItem of flatNavItems) {
    const item: NavItem = {
      label: navItem.label,
      href: navItem.href,
      moduleKey: navItem.moduleKey
    };

    if (!navItem.groupLabel) {
      rootEntries.push({ order: navItem.order, item });
      continue;
    }

    const groupKey = `${navItem.groupLabel}|${navItem.groupHref || navItem.groupLabel}`;
    const existingGroup = groups.get(groupKey) || {
      label: navItem.groupLabel,
      href: navItem.groupHref || navItem.href,
      order: navItem.groupOrder ?? navItem.order,
      children: []
    };

    existingGroup.children.push({ order: navItem.order, item });
    groups.set(groupKey, existingGroup);
  }

  const groupEntries: Array<{ order: number; item: NavItem }> = Array.from(groups.values()).map((group) => ({
    order: group.order,
    item: {
      label: group.label,
      href: group.href,
      children: group.children.sort((left, right) => left.order - right.order).map((entry) => entry.item)
    }
  }));

  return [...rootEntries, ...groupEntries]
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.item);
}

export const NAV_ITEMS: NavItem[] = buildNavItemsFromModules();

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  tender_lead: "Lider Licitaciones",
  contract_manager: "Contract Manager",
  finance: "Analista Finanzas",
  hr: "Lider RRHH",
  viewer: "Solo lectura"
};
