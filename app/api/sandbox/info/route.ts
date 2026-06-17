import { NextResponse } from "next/server"

import { jsonError, searchStringParam } from "@/lib/http/api-route"
import { daytonaApiErrorResponse } from "@/lib/daytona/api-errors"
import { readDaytonaSandboxInfo } from "@/lib/daytona/sandbox"
import { requireCurrentUserSandbox } from "@/lib/sandbox/authorization"

export const runtime = "nodejs"

const INFO_READ_TIMEOUT_MS = 8_000

export async function GET(request: Request) {
  const sandboxId = searchStringParam(request, "sandboxId")

  if (!sandboxId) {
    return jsonError("sandboxId required", 400)
  }

  try {
    await requireCurrentUserSandbox(sandboxId)
    return NextResponse.json(
      await readDaytonaSandboxInfo(sandboxId, {
        timeoutMs: INFO_READ_TIMEOUT_MS,
      })
    )
  } catch (error) {
    return daytonaApiErrorResponse(error, "Unable to read sandbox status.")
  }
}
