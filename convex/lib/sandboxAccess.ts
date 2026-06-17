import type { Id } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"

/**
 * Resolve whether the given user owns the sandbox, returning the shared
 * sandbox metadata (repoUrl) when they do. Ownership is established by either a
 * codex run, thread, or preset environment record that references the sandbox
 * and belongs to the user.
 */
export async function sandboxAccessForUser(
  ctx: QueryCtx,
  sandboxId: string,
  userId: Id<"users">
) {
  const runs = await ctx.db
    .query("codexRuns")
    .withIndex("by_sandbox", (q) => q.eq("sandboxId", sandboxId))
    .take(10)
  const run = runs.find((candidate) => candidate.userId === userId)
  if (run) return { repoUrl: run.repoUrl, userId }

  const threads = await ctx.db
    .query("threads")
    .withIndex("by_sandbox", (q) => q.eq("sandboxId", sandboxId))
    .take(10)
  const thread = threads.find((candidate) => candidate.userId === userId)
  if (thread) return { repoUrl: thread.repoUrl, userId }

  const environment = await ctx.db
    .query("sandboxPresetEnvironments")
    .withIndex("by_active_sandbox_user", (q) =>
      q.eq("activeSandboxId", sandboxId).eq("userId", userId)
    )
    .first()
  if (environment) return { repoUrl: environment.repoUrl, userId }

  const build = await ctx.db
    .query("sandboxPresetBuilds")
    .withIndex("by_sandbox_user", (q) =>
      q.eq("sandboxId", sandboxId).eq("userId", userId)
    )
    .first()
  if (build) return { repoUrl: build.repoUrl, userId }

  return null
}
