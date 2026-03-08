import { MODULE_KEYS, type ModuleKey } from "@/modules/registry";
import type { BillingPlanCode, TenantPlan } from "@/types/domain";

const TENANT_ENABLED_MODULES = MODULE_KEYS.filter(
  (moduleKey) => moduleKey !== "platform" && moduleKey !== "correspondencia_cruzada"
);

const PLAN_LIMITS: Record<BillingPlanCode, { maxUsers: number; enabledModules: ModuleKey[] }> = {
  starter: {
    maxUsers: 25,
    enabledModules: TENANT_ENABLED_MODULES
  },
  pro: {
    maxUsers: 100,
    enabledModules: TENANT_ENABLED_MODULES
  },
  enterprise: {
    maxUsers: 500,
    enabledModules: TENANT_ENABLED_MODULES
  }
};

export function buildTenantPlan(code: BillingPlanCode = "starter"): TenantPlan {
  const plan = PLAN_LIMITS[code];
  return {
    code,
    status: "active",
    limits: {
      maxUsers: plan.maxUsers,
      enabledModules: [...plan.enabledModules]
    }
  };
}

export function getPlanLimits(code: BillingPlanCode) {
  return PLAN_LIMITS[code];
}
