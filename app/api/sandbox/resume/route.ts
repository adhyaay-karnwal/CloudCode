import { NextResponse } from "next/server"

import {
  BillingRequiredError,
  observeCurrentUserDaytonaBillingInfo,
  pauseCurrentUserSandboxForBilling,
  requireCurrentUserInfraAccess,
} from "@/lib/billing-server"
import { resumeDaytonaSandbox } from "@/lib/daytona-sandbox"
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
    await requireCurrentUserInfraAccess()
    const info = await resumeDaytonaSandbox(sandboxId)
    await observeCurrentUserDaytonaBillingInfo(info)
    return NextResponse.json(info)
  } catch (error) {
    if (error instanceof BillingRequiredError) {
      await pauseCurrentUserSandboxForBilling(sandboxId)
      return NextResponse.json({ error: error.message }, { status: 402 })
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to resume sandbox.",
      },
      { status: 500 }
    )
  }
}
