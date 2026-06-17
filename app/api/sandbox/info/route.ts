import { NextResponse } from "next/server"

import { jsonError, searchStringParam } from "@/lib/http/api-route"
import {
  isDaytonaNotFoundError,
  isDaytonaOperationTimeoutError,
  readDaytonaSandboxInfo,
} from "@/lib/daytona/sandbox"
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
    if (isDaytonaOperationTimeoutError(error)) {
      return jsonError(error.message, 504)
    }

    if (!isDaytonaNotFoundError(error)) {
      return jsonError(
        error instanceof Error
          ? error.message
          : "Unable to read sandbox status.",
        502
      )
    }

    return jsonError(
      error instanceof Error ? error.message : "Sandbox not found",
      404,
      { notFound: true }
    )
  }
}
