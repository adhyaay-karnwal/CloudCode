import { NextResponse } from "next/server"

import {
  BillingRequiredError,
  observeCurrentUserDaytonaBillingInfo,
  pauseCurrentUserSandboxForBilling,
  requireCurrentUserInfraAccess,
} from "@/lib/billing-server"
import {
  openDaytonaDesktopBrowser,
  readDaytonaDesktopStatus,
  startDaytonaDesktop,
  stopDaytonaDesktop,
} from "@/lib/daytona-desktop"
import { readDaytonaSandboxInfo } from "@/lib/daytona-sandbox"
import { requireSameOrigin } from "@/lib/request-security"
import { requireCurrentUserSandbox } from "@/lib/sandbox-authorization"

export const runtime = "nodejs"
export const maxDuration = 300

type DesktopAction = "open-browser" | "start" | "stop"

async function parseBody(request: Request) {
  try {
    return (await request.json()) as {
      action?: unknown
      sandboxId?: unknown
      url?: unknown
    }
  } catch {
    return {}
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: Request) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  const { searchParams } = new URL(request.url)
  const sandboxId = searchParams.get("sandboxId")

  if (!sandboxId) {
    return jsonError("sandboxId required", 400)
  }

  try {
    await requireCurrentUserSandbox(sandboxId)
    return NextResponse.json(await readDaytonaDesktopStatus(sandboxId))
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Failed to read Daytona desktop status.",
      500
    )
  }
}

export async function POST(request: Request) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  const body = await parseBody(request)
  const sandboxId = typeof body.sandboxId === "string" ? body.sandboxId : ""
  const action = typeof body.action === "string" ? body.action : ""

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
              typeof body.url === "string" ? body.url : undefined
            )
          : await stopDaytonaDesktop(sandboxId)
    await readDaytonaSandboxInfo(sandboxId)
      .then(observeCurrentUserDaytonaBillingInfo)
      .catch((error) => {
        console.warn("Unable to observe desktop sandbox billing.", error)
      })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BillingRequiredError) {
      await pauseCurrentUserSandboxForBilling(sandboxId)
      return jsonError(error.message, 402)
    }

    return jsonError(
      error instanceof Error
        ? error.message
        : "Failed to update Daytona desktop.",
      500
    )
  }
}
