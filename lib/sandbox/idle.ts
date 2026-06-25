/**
 * Per-user sandbox idle timeout (Daytona auto-stop interval), in minutes.
 *
 * Shared between the settings UI, the Convex mutation that persists the choice,
 * and the Daytona helpers that apply it to a sandbox. Keep this module free of
 * heavy/server-only imports so it stays safe to import from Convex and the
 * browser bundle alike.
 */

export const SANDBOX_IDLE_MINUTES_MIN = 1
export const SANDBOX_IDLE_MINUTES_MAX = 10

/** Matches the previous hardcoded Daytona auto-stop interval. */
export const SANDBOX_IDLE_MINUTES_DEFAULT = 7

/**
 * Coerce an arbitrary (possibly absent or out-of-range) value into a valid
 * idle timeout. Falls back to the default when the value is missing or not a
 * finite number, then rounds and clamps into the supported range.
 */
export function clampSandboxIdleMinutes(
  minutes: number | null | undefined
): number {
  if (minutes == null || !Number.isFinite(minutes)) {
    return SANDBOX_IDLE_MINUTES_DEFAULT
  }

  return Math.min(
    SANDBOX_IDLE_MINUTES_MAX,
    Math.max(SANDBOX_IDLE_MINUTES_MIN, Math.round(minutes))
  )
}
