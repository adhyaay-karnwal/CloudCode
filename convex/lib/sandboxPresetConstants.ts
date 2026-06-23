import type { Doc } from "../_generated/dataModel"

export const DEFAULT_PRESET = {
  environmentSlug: "default",
  mode: "manual" as const,
  name: "Default",
}

export const AUTO_ENVIRONMENT_PRESET = {
  environmentSlug: "auto",
  mode: "auto" as const,
  name: "Auto environment",
}

type BuiltInPresetIdentity = Pick<
  Doc<"sandboxPresets">,
  "environmentSlug" | "mode" | "name"
>

function matchesBuiltInPreset(
  preset: BuiltInPresetIdentity,
  builtIn: typeof DEFAULT_PRESET | typeof AUTO_ENVIRONMENT_PRESET
) {
  return (
    (preset.mode ?? "manual") === builtIn.mode &&
    preset.environmentSlug === builtIn.environmentSlug &&
    preset.name === builtIn.name
  )
}

export function isBuiltInDefaultPreset(preset: BuiltInPresetIdentity) {
  return matchesBuiltInPreset(preset, DEFAULT_PRESET)
}

export function isBuiltInAutoEnvironmentPreset(preset: BuiltInPresetIdentity) {
  return matchesBuiltInPreset(preset, AUTO_ENVIRONMENT_PRESET)
}

export function isBuiltInPreset(preset: BuiltInPresetIdentity) {
  return (
    isBuiltInDefaultPreset(preset) || isBuiltInAutoEnvironmentPreset(preset)
  )
}
