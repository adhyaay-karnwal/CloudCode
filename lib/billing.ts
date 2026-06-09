export const BILLING_INFRA_USAGE_FEATURE_ID = "infra_usage"
export const BILLING_USAGE_UNIT = "micro_usd"
export const BILLING_MICRO_USD_PER_USD = 1_000_000
export const BILLING_MICRO_USD_PER_CENT = BILLING_MICRO_USD_PER_USD / 100

export const BILLING_HOBBY_PLAN_ID = "hobby"
export const BILLING_PLUS_PLAN_ID = "plus"

export const BILLING_PLANS = [
  {
    name: "Hobby",
    planId: BILLING_HOBBY_PLAN_ID,
    priceUsd: 10,
  },
  {
    name: "Plus",
    planId: BILLING_PLUS_PLAN_ID,
    priceUsd: 20,
  },
] as const

export type BillingPlanId = (typeof BILLING_PLANS)[number]["planId"]

export type BillingUsageSource = "trigger" | "daytona" | "reconciliation"

export type DaytonaBillingState =
  | "running"
  | "stopped"
  | "archived"
  | "deleted"
  | "unknown"

export type DaytonaBillingResources = {
  cpu: number
  diskGiB: number
  memoryGiB: number
}

export type DaytonaBillingRates = {
  cpuMicroUsdPerVcpuSecond: number
  memoryMicroUsdPerGibSecond: number
  storageMicroUsdPerGibSecond: number
}

export const DAYTONA_BILLING_RATE_VERSION = "daytona-2026-06-09"
export const DAYTONA_BILLING_RATES: DaytonaBillingRates = {
  cpuMicroUsdPerVcpuSecond: 14,
  memoryMicroUsdPerGibSecond: 4.5,
  storageMicroUsdPerGibSecond: 0.03,
}

export const BILLING_DAYTONA_CHECKPOINT_MS = 60_000
export const BILLING_TRIGGER_CHECKPOINT_MS = 30_000
export const BILLING_MINIMUM_START_BALANCE_MICRO_USD = 10_000
export const BILLING_MAX_SETTLEMENT_DELAY_MS = 48 * 60 * 60 * 1000

export function billingPlanForId(planId: string | undefined | null) {
  return BILLING_PLANS.find((plan) => plan.planId === planId)
}

export function microUsdFromTriggerCents(costInCents: number) {
  if (!Number.isFinite(costInCents) || costInCents <= 0) return 0
  return ceilMicroUsd(costInCents * BILLING_MICRO_USD_PER_CENT)
}

export function ceilMicroUsd(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0
  const nearest = Math.round(value)
  if (Math.abs(value - nearest) < 1e-9) return nearest
  return Math.ceil(value)
}

export function microUsdToUsd(value: number) {
  return value / BILLING_MICRO_USD_PER_USD
}

export function formatMicroUsd(value: number) {
  return `$${microUsdToUsd(value).toFixed(4)}`
}

export function daytonaBillingState(rawState: string | undefined | null) {
  switch (rawState) {
    case "archived":
    case "archiving":
      return "archived" satisfies DaytonaBillingState
    case "destroyed":
    case "destroying":
    case "deleted":
      return "deleted" satisfies DaytonaBillingState
    case "stopped":
    case "stopping":
      return "stopped" satisfies DaytonaBillingState
    case "started":
    case "starting":
    case "recovering":
    case "resizing":
      return "running" satisfies DaytonaBillingState
    default:
      return rawState ? "unknown" : "unknown"
  }
}

export function daytonaSegmentMicroUsd({
  durationMs,
  rates = DAYTONA_BILLING_RATES,
  resources,
  state,
}: {
  durationMs: number
  rates?: DaytonaBillingRates
  resources: DaytonaBillingResources
  state: DaytonaBillingState
}) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0
  if (state === "archived" || state === "deleted") return 0

  const seconds = durationMs / 1000
  const storage =
    resources.diskGiB * rates.storageMicroUsdPerGibSecond * seconds

  if (state === "stopped") return ceilMicroUsd(storage)

  const cpu = resources.cpu * rates.cpuMicroUsdPerVcpuSecond * seconds
  const memory =
    resources.memoryGiB * rates.memoryMicroUsdPerGibSecond * seconds

  return ceilMicroUsd(cpu + memory + storage)
}

export function readDaytonaBillingRatesFromEnv(
  env: Record<string, string | undefined> = process.env
): DaytonaBillingRates {
  return {
    cpuMicroUsdPerVcpuSecond: readPositiveEnvNumber(
      env.DAYTONA_BILLING_CPU_MICRO_USD_PER_VCPU_SECOND,
      DAYTONA_BILLING_RATES.cpuMicroUsdPerVcpuSecond
    ),
    memoryMicroUsdPerGibSecond: readPositiveEnvNumber(
      env.DAYTONA_BILLING_MEMORY_MICRO_USD_PER_GIB_SECOND,
      DAYTONA_BILLING_RATES.memoryMicroUsdPerGibSecond
    ),
    storageMicroUsdPerGibSecond: readPositiveEnvNumber(
      env.DAYTONA_BILLING_STORAGE_MICRO_USD_PER_GIB_SECOND,
      DAYTONA_BILLING_RATES.storageMicroUsdPerGibSecond
    ),
  }
}

function readPositiveEnvNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}
