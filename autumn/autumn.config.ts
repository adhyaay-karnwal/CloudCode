import { feature, item, plan, type AutumnConfig } from "atmn"

import {
  BILLING_HOBBY_PLAN_ID,
  BILLING_INFRA_USAGE_FEATURE_ID,
  BILLING_PLUS_PLAN_ID,
} from "../lib/billing"
import { readPlanIncludedMicroUsd } from "../lib/billing-private"

export const infraUsage = feature({
  consumable: true,
  id: BILLING_INFRA_USAGE_FEATURE_ID,
  name: "Infrastructure usage",
  type: "metered",
})

export const hobby = plan({
  id: BILLING_HOBBY_PLAN_ID,
  items: [
    item({
      featureId: infraUsage.id,
      included: readPlanIncludedMicroUsd(BILLING_HOBBY_PLAN_ID),
      reset: { interval: "month" },
    }),
  ],
  name: "Hobby",
  price: { amount: 10, interval: "month" },
})

export const plus = plan({
  id: BILLING_PLUS_PLAN_ID,
  items: [
    item({
      featureId: infraUsage.id,
      included: readPlanIncludedMicroUsd(BILLING_PLUS_PLAN_ID),
      reset: { interval: "month" },
    }),
  ],
  name: "Plus",
  price: { amount: 20, interval: "month" },
})

export default {
  features: [infraUsage],
  plans: [hobby, plus],
} satisfies AutumnConfig
