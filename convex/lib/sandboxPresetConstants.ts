import type { Doc } from "../_generated/dataModel"

export const AUTO_ENVIRONMENT_PRESET = {
  environmentSlug: "auto",
  mode: "auto" as const,
  name: "Auto environment",
}

export function isBuiltInAutoEnvironmentPreset(
  preset: Pick<Doc<"sandboxPresets">, "environmentSlug" | "mode" | "name">
) {
  return (
    preset.mode === AUTO_ENVIRONMENT_PRESET.mode &&
    preset.environmentSlug === AUTO_ENVIRONMENT_PRESET.environmentSlug &&
    preset.name === AUTO_ENVIRONMENT_PRESET.name
  )
}
