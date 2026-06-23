import type { Doc } from "../_generated/dataModel"
import {
  isBuiltInAutoEnvironmentPreset,
  isBuiltInDefaultPreset,
} from "./sandboxPresetConstants"

export function isLegacyDefaultPreset(
  preset: {
    daytonaSnapshot?: string
    installScript?: string
    name: string
    pathInstallScript?: string
  },
  secretCount: number
) {
  return (
    preset.name === "Default Daytona" &&
    !preset.daytonaSnapshot &&
    !preset.installScript &&
    !preset.pathInstallScript &&
    secretCount === 0
  )
}

function secretSummaryRows(secrets: Doc<"sandboxPresetSecrets">[]) {
  return secrets
    .map((secret) => ({
      hasValue: Boolean(secret.value),
      id: secret._id,
      name: secret.name,
      updatedAt: secret.updatedAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function secretValueRows(secrets: Doc<"sandboxPresetSecrets">[]) {
  return secrets
    .map((secret) => ({
      name: secret.name,
      value: secret.value,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function environmentRowsForPreset(
  environmentPresetId: Doc<"sandboxPresets">["_id"],
  environments: Doc<"sandboxPresetEnvironments">[]
) {
  return environments
    .filter((environment) => environment.presetId === environmentPresetId)
    .slice(0, 8)
    .map((environment) => ({
      activeSandboxId: environment.activeSandboxId,
      builtAt: environment.builtAt,
      environmentSlug: environment.environmentSlug,
      id: environment._id,
      repoUrl: environment.repoUrl,
      status: environment.status,
      updatedAt: environment.updatedAt,
    }))
}

export function sandboxPresetListRow({
  environments,
  environmentPresetId,
  preset,
  secrets,
}: {
  environments?: Doc<"sandboxPresetEnvironments">[]
  environmentPresetId?: Doc<"sandboxPresets">["_id"]
  preset: Doc<"sandboxPresets">
  secrets: Doc<"sandboxPresetSecrets">[]
}) {
  const isDefaultPreset = isBuiltInDefaultPreset(preset)

  return {
    createdAt: preset.createdAt,
    daytonaSnapshot: isDefaultPreset ? undefined : preset.daytonaSnapshot,
    environmentSlug: preset.environmentSlug,
    id: preset._id,
    installScript: isDefaultPreset ? undefined : preset.installScript,
    isBuiltInAutoEnvironment: isBuiltInAutoEnvironmentPreset(preset),
    isBuiltInDefault: isDefaultPreset,
    mode: preset.mode ?? "manual",
    name: preset.name,
    pathInstallScript: isDefaultPreset ? undefined : preset.pathInstallScript,
    ...(environments
      ? {
          environments: environmentRowsForPreset(
            environmentPresetId ?? preset._id,
            environments
          ),
        }
      : {}),
    secrets: isDefaultPreset ? [] : secretSummaryRows(secrets),
    updatedAt: preset.updatedAt,
  }
}

export function sandboxPresetRunInput(
  preset: Doc<"sandboxPresets">,
  secrets: Doc<"sandboxPresetSecrets">[]
) {
  const isDefaultPreset = isBuiltInDefaultPreset(preset)

  return {
    daytonaSnapshot: isDefaultPreset ? undefined : preset.daytonaSnapshot,
    environmentSlug: preset.environmentSlug,
    id: preset._id,
    installScript: isDefaultPreset ? undefined : preset.installScript,
    mode: preset.mode ?? "manual",
    name: preset.name,
    pathInstallScript: isDefaultPreset ? undefined : preset.pathInstallScript,
    secrets: isDefaultPreset ? [] : secretValueRows(secrets),
  }
}

export function autoEnvironmentRunRow(
  environment: Doc<"sandboxPresetEnvironments">
) {
  return {
    activeSandboxId: environment.activeSandboxId,
    buildNumber: environment.buildNumber,
    builtAt: environment.builtAt,
    cloudcodeYaml: environment.cloudcodeYaml,
    configHash: environment.configHash,
    environmentSlug: environment.environmentSlug,
    id: environment._id,
    lastError: environment.lastError,
    repoUrl: environment.repoUrl,
    status: environment.status,
    updatedAt: environment.updatedAt,
  }
}
