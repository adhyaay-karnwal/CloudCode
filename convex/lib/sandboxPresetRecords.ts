import type { Doc } from "../_generated/dataModel"

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

export function isAutoPreset(preset: { mode?: "manual" | "auto" }) {
  return preset.mode === "auto"
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
  presetId: Doc<"sandboxPresets">["_id"],
  environments: Doc<"sandboxPresetEnvironments">[]
) {
  return environments
    .filter((environment) => environment.presetId === presetId)
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
  preset,
  secrets,
}: {
  environments?: Doc<"sandboxPresetEnvironments">[]
  preset: Doc<"sandboxPresets">
  secrets: Doc<"sandboxPresetSecrets">[]
}) {
  return {
    createdAt: preset.createdAt,
    daytonaSnapshot: preset.daytonaSnapshot,
    environmentSlug: preset.environmentSlug,
    id: preset._id,
    installScript: preset.installScript,
    mode: preset.mode ?? "manual",
    name: preset.name,
    pathInstallScript: preset.pathInstallScript,
    ...(environments
      ? { environments: environmentRowsForPreset(preset._id, environments) }
      : {}),
    secrets: secretSummaryRows(secrets),
    updatedAt: preset.updatedAt,
  }
}

export function sandboxPresetRunInput(
  preset: Doc<"sandboxPresets">,
  secrets: Doc<"sandboxPresetSecrets">[]
) {
  return {
    daytonaSnapshot: preset.daytonaSnapshot,
    environmentSlug: preset.environmentSlug,
    id: preset._id,
    installScript: preset.installScript,
    mode: preset.mode ?? "manual",
    name: preset.name,
    pathInstallScript: preset.pathInstallScript,
    secrets: secretValueRows(secrets),
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
