import { NextResponse } from "next/server"

import { observeCurrentUserDaytonaBilling } from "@/lib/billing-server"
import {
  deleteDaytonaSandboxQuietly,
  readDaytonaSandboxInfo,
} from "@/lib/daytona-sandbox"
import { requireSameOrigin } from "@/lib/request-security"
import { requireCurrentUserSandbox } from "@/lib/sandbox-authorization"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: Request) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  let sandboxId: string | undefined

  try {
    const body = (await request.json()) as { sandboxId?: unknown }
    if (typeof body.sandboxId === "string") sandboxId = body.sandboxId
  } catch {
    // ignore malformed bodies; validation below returns a clean error
  }

  if (!sandboxId) {
    return NextResponse.json({ error: "sandboxId required" }, { status: 400 })
  }

  try {
    await requireCurrentUserSandbox(sandboxId)
  } catch {
    return NextResponse.json({ error: "Sandbox not found." }, { status: 404 })
  }

  const info = await readDaytonaSandboxInfo(sandboxId).catch(() => null)
  if (info) {
    await observeCurrentUserDaytonaBilling({
      resources: {
        cpu: info.cpu,
        diskGiB: info.diskGiB,
        memoryGiB: info.memoryGiB,
      },
      sandboxId,
      state: "deleted",
    }).catch((error) => {
      console.warn("Unable to observe deleted sandbox billing.", error)
    })
  }

  await deleteDaytonaSandboxQuietly(sandboxId)

  return NextResponse.json({
    deleted: true,
    sandboxId,
  })
}
