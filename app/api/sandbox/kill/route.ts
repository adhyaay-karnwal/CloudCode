import { NextResponse } from "next/server"

import { jsonError, readJsonStringField } from "@/lib/http/api-route"
import { requireSameOrigin } from "@/lib/http/request-security"
import { requireCurrentUserSandbox } from "@/lib/sandbox/authorization"
import { deleteCurrentUserDaytonaSandbox } from "@/lib/sandbox/delete"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: Request) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  const sandboxId = await readJsonStringField(request, "sandboxId")
  if (!sandboxId) {
    return jsonError("sandboxId required", 400)
  }

  try {
    await requireCurrentUserSandbox(sandboxId)
  } catch {
    return jsonError("Sandbox not found.", 404)
  }

  await deleteCurrentUserDaytonaSandbox(sandboxId)

  return NextResponse.json({
    deleted: true,
    sandboxId,
  })
}
