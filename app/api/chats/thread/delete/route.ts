import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convexHttpClientForSession } from "@/lib/convex/http"
import {
  jsonError,
  jsonStringField,
  readJsonRecord,
} from "@/lib/http/api-route"
import { requireSameOrigin } from "@/lib/http/request-security"
import { deleteCurrentUserDaytonaSandboxes } from "@/lib/sandbox/delete"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: Request) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  const body = await readJsonRecord(request)
  const threadId = jsonStringField(body, "threadId")
  if (!threadId) {
    return jsonError("threadId required", 400)
  }

  const session = await auth()
  if (!session.userId) {
    return jsonError("Not authenticated.", 401)
  }

  try {
    const client = await convexHttpClientForSession(session)
    const { sandboxIds } = await client.query(api.chats.threadSandboxIds, {
      threadId: threadId as Id<"threads">,
    })

    await deleteCurrentUserDaytonaSandboxes(sandboxIds)
    await client.mutation(api.chats.deleteThread, {
      threadId: threadId as Id<"threads">,
    })

    return NextResponse.json({
      deleted: true,
      sandboxIds,
    })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to delete chat.",
      500
    )
  }
}
