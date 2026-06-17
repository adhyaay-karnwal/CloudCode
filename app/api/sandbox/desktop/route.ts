import { NextResponse } from "next/server"

import {
  BillingRequiredError,
  observeCurrentUserDaytonaBillingInfo,
  pauseCurrentUserSandboxForBilling,
  requireCurrentUserInfraAccess,
} from "@/lib/billing/server"
import {
  openDaytonaDesktopBrowser,
  readDaytonaDesktopStatus,
  startDaytonaDesktop,
  stopDaytonaDesktop,
} from "@/lib/daytona/desktop"
import { daytonaApiErrorResponse } from "@/lib/daytona/api-errors"
import {
  jsonError,
  jsonStringField,
  readJsonRecord,
  searchStringParam,
} from "@/lib/http/api-route"
import { readDaytonaSandboxInfo } from "@/lib/daytona/sandbox"
import { requireSameOrigin } from "@/lib/http/request-security"
import {
  requireCurrentUserSandbox,
  SandboxAuthorizationError,
} from "@/lib/sandbox/authorization"

export const runtime = "nodejs"
export const maxDuration = 300

type DesktopAction = "open-browser" | "start" | "stop"

export async function GET(request: Request) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  const sandboxId = searchStringParam(request, "sandboxId")

  if (!sandboxId) {
    return jsonError("sandboxId required", 400)
  }

  try {
    await requireCurrentUserSandbox(sandboxId)
    return NextResponse.json(await readDaytonaDesktopStatus(sandboxId))
  } catch (error) {
    if (error instanceof SandboxAuthorizationError) {
      return jsonError(error.message, 404)
    }

    return daytonaApiErrorResponse(
      error,
      "Failed to read Daytona desktop status."
    )
  }
}

export async function POST(request: Request) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  const body = await readJsonRecord(request)
  const sandboxId = jsonStringField(body, "sandboxId")
  const action = jsonStringField(body, "action")

  if (!sandboxId) {
    return jsonError("sandboxId required", 400)
  }
  if (action !== "start" && action !== "stop" && action !== "open-browser") {
    return jsonError("invalid desktop action", 400)
  }

  try {
    await requireCurrentUserSandbox(sandboxId)
    await requireCurrentUserInfraAccess()
    const typedAction = action as DesktopAction
    const result =
      typedAction === "start"
        ? await startDaytonaDesktop(sandboxId)
        : typedAction === "open-browser"
          ? await openDaytonaDesktopBrowser(
              sandboxId,
              jsonStringField(body, "url")
            )
          : await stopDaytonaDesktop(sandboxId)
    await readDaytonaSandboxInfo(sandboxId)
      .then(observeCurrentUserDaytonaBillingInfo)
      .catch((error) => {
        console.warn("Unable to observe desktop sandbox billing.", error)
      })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SandboxAuthorizationError) {
      return jsonError(error.message, 404)
    }

    if (error instanceof BillingRequiredError) {
      await pauseCurrentUserSandboxForBilling(sandboxId)
      return jsonError(error.message, 402)
    }

    return daytonaApiErrorResponse(error, "Failed to update Daytona desktop.")
  }
}
