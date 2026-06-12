import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

export async function requireOwnedThread(
  ctx: MutationCtx | QueryCtx,
  threadId: Id<"threads">,
  userId: Id<"users">
): Promise<Doc<"threads">> {
  const thread = await ctx.db.get(threadId)

  if (!thread || thread.userId !== userId) {
    throw new Error("Thread not found.")
  }

  return thread
}

export async function requireOwnedAssistantMessage(
  ctx: MutationCtx | QueryCtx,
  messageId: Id<"messages">,
  threadId: Id<"threads">,
  userId: Id<"users">
): Promise<Doc<"messages">> {
  const message = await ctx.db.get(messageId)

  if (
    !message ||
    message.threadId !== threadId ||
    message.userId !== userId ||
    message.role !== "assistant"
  ) {
    throw new Error("Message not found.")
  }

  return message
}
