import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { appendBuildRunLogs, type StoredRunLog } from "./codexRunLogs"
import { requireOwnedPreset } from "./sandboxPresets"
import { repoSlug, slugify } from "./sandboxPresetValidation"

export async function beginAutoEnvironmentBuildForUser(
  ctx: MutationCtx,
  args: {
    baseBranch?: string
    presetId: Id<"sandboxPresets">
    repoUrl: string
  },
  userId: Id<"users">
) {
  const preset = await requireOwnedPreset(ctx, args.presetId, userId)
  if ((preset.mode ?? "manual") !== "auto") {
    throw new Error("Preset is not an auto environment preset.")
  }

  const repoUrl = args.repoUrl.trim()
  if (!repoUrl) throw new Error("repoUrl is required.")

  const now = Date.now()
  let environment = await ctx.db
    .query("sandboxPresetEnvironments")
    .withIndex("by_preset_repo", (q) =>
      q
        .eq("userId", userId)
        .eq("presetId", args.presetId)
        .eq("repoUrl", repoUrl)
    )
    .unique()

  const environmentSlug = slugify(
    [
      preset.environmentSlug && preset.environmentSlug !== "auto"
        ? preset.environmentSlug
        : preset.name,
      repoSlug(repoUrl),
    ]
      .filter(Boolean)
      .join("-")
  )
  const buildNumber = (environment?.buildNumber ?? 0) + 1

  if (!environment) {
    const environmentId = await ctx.db.insert("sandboxPresetEnvironments", {
      ...(args.baseBranch?.trim()
        ? { baseBranch: args.baseBranch.trim() }
        : {}),
      buildNumber,
      createdAt: now,
      environmentSlug,
      presetId: args.presetId,
      repoUrl,
      status: "building",
      updatedAt: now,
      userId,
    })
    environment = (await ctx.db.get(environmentId))!
  } else {
    await ctx.db.patch(environment._id, {
      ...(args.baseBranch?.trim()
        ? { baseBranch: args.baseBranch.trim() }
        : {}),
      buildNumber,
      environmentSlug,
      lastError: undefined,
      status: "building",
      updatedAt: now,
    })
  }

  const buildId = await ctx.db.insert("sandboxPresetBuilds", {
    buildNumber,
    createdAt: now,
    environmentId: environment._id,
    logs: [],
    presetId: args.presetId,
    repoUrl,
    startedAt: now,
    status: "building",
    updatedAt: now,
    userId,
  })
  await ctx.db.patch(environment._id, {
    activeBuildId: buildId,
    activeSandboxId: undefined,
    activeSnapshot: undefined,
    updatedAt: now,
  })

  return {
    buildId,
    buildNumber,
    environmentId: environment._id,
    environmentSlug,
  }
}

export async function requireOwnedBuild(
  ctx: MutationCtx,
  buildId: Id<"sandboxPresetBuilds">,
  userId: Id<"users">
) {
  const build = await ctx.db.get(buildId)
  if (!build || build.userId !== userId) {
    throw new Error("Environment build not found.")
  }
  return build
}

export async function requireBuildForWorker(
  ctx: MutationCtx,
  buildId: Id<"sandboxPresetBuilds">
) {
  const build = await ctx.db.get(buildId)
  if (!build) {
    throw new Error("Environment build not found.")
  }
  return build
}

export async function appendAutoEnvironmentBuildLogsToBuild(
  ctx: MutationCtx,
  build: Doc<"sandboxPresetBuilds">,
  logs: StoredRunLog[]
) {
  if (logs.length === 0) return

  const nextLogs = appendBuildRunLogs(build.logs, logs)
  if (!nextLogs.appended) return

  await ctx.db.patch(build._id, {
    logs: nextLogs.logs,
    updatedAt: Date.now(),
  })
}

export async function completeAutoEnvironmentBuildForBuild(
  ctx: MutationCtx,
  build: Doc<"sandboxPresetBuilds">,
  args: {
    cloudcodeYaml: string
    configHash: string
    sandboxId?: string
  }
) {
  const now = Date.now()

  await ctx.db.patch(build._id, {
    cloudcodeYaml: args.cloudcodeYaml,
    configHash: args.configHash,
    finishedAt: now,
    sandboxId: args.sandboxId,
    status: "ready",
    updatedAt: now,
  })
  await ctx.db.patch(build.environmentId, {
    activeBuildId: build._id,
    activeSandboxId: args.sandboxId,
    activeSnapshot: undefined,
    builtAt: now,
    cloudcodeYaml: args.cloudcodeYaml,
    configHash: args.configHash,
    lastError: undefined,
    status: "ready",
    updatedAt: now,
  })
}

export async function failAutoEnvironmentBuildForBuild(
  ctx: MutationCtx,
  build: Doc<"sandboxPresetBuilds">,
  error: string
) {
  const now = Date.now()

  await ctx.db.patch(build._id, {
    error,
    finishedAt: now,
    status: "failed",
    updatedAt: now,
  })
  await ctx.db.patch(build.environmentId, {
    lastError: error,
    status: "failed",
    updatedAt: now,
  })
}
