import { NextResponse } from "next/server"

import {
  BillingRequiredError,
  observeCurrentUserDaytonaBillingInfo,
  pauseCurrentUserSandboxForBilling,
  requireCurrentUserInfraAccess,
} from "@/lib/billing-server"
import {
  daytonaTerminalHasCurrentGitHubAuth,
  killDaytonaTerminal,
} from "@/lib/daytona-terminal-sessions"
import {
  prepareDaytonaTerminalWebSocket,
  refreshDaytonaTerminalWebSocketGitHubAuth,
  resizeDaytonaTerminalWebSocket,
} from "@/lib/daytona-terminal-websocket"
import { readDaytonaSandboxInfo } from "@/lib/daytona-sandbox"
import { maybeGetCurrentGitHubRepoCredential } from "@/lib/github-auth"
import { requireSameOrigin } from "@/lib/request-security"
import { requireCurrentUserSandbox } from "@/lib/sandbox-authorization"

export const runtime = "nodejs"

function numberParam(value: string | null, fallback: number) {
  if (!value) return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

async function requireTerminalAccess(sandboxId: string) {
  const [sandboxAccessResult, infraAccessResult] = await Promise.allSettled([
    requireCurrentUserSandbox(sandboxId),
    requireCurrentUserInfraAccess(),
  ])

  if (sandboxAccessResult.status === "rejected") {
    return {
      response: NextResponse.json(
        { error: "Sandbox not found." },
        { status: 404 }
      ),
    }
  }

  if (infraAccessResult.status === "rejected") {
    const error = infraAccessResult.reason
    if (error instanceof BillingRequiredError) {
      await pauseCurrentUserSandboxForBilling(sandboxId)
      return {
        response: NextResponse.json({ error: error.message }, { status: 402 }),
      }
    }

    return {
      response: NextResponse.json(
        { error: "Sandbox not found." },
        { status: 404 }
      ),
    }
  }

  return { sandboxAccess: sandboxAccessResult.value }
}

function terminalRequiredResponse() {
  return NextResponse.json(
    { error: "sandboxId and terminalId required" },
    { status: 400 }
  )
}

export async function GET(request: Request) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  const { searchParams } = new URL(request.url)
  const sandboxId = searchParams.get("sandboxId")
  const terminalId = searchParams.get("terminalId")
  const cols = numberParam(searchParams.get("cols"), 100)
  const rows = numberParam(searchParams.get("rows"), 30)

  if (!sandboxId || !terminalId) {
    return terminalRequiredResponse()
  }

  const access = await requireTerminalAccess(sandboxId)
  if ("response" in access) return access.response

  try {
    const githubAuthPromise = daytonaTerminalHasCurrentGitHubAuth(
      sandboxId,
      terminalId
    )
      ? null
      : maybeGetCurrentGitHubRepoCredential(access.sandboxAccess.repoUrl)

    const terminal = await prepareDaytonaTerminalWebSocket({
      cols,
      rows,
      sandboxId,
      terminalId,
    })

    void readDaytonaSandboxInfo(sandboxId)
      .then(observeCurrentUserDaytonaBillingInfo)
      .catch((error: unknown) => {
        console.warn("Unable to observe terminal sandbox billing.", error)
      })

    if (githubAuthPromise) {
      void githubAuthPromise
        .then((githubAuth) =>
          refreshDaytonaTerminalWebSocketGitHubAuth({
            githubToken: githubAuth?.token,
            githubTokenExpiresAt: githubAuth?.expiresAt,
            githubUserEmail: githubAuth?.gitUserEmail,
            githubUserName: githubAuth?.gitUserName,
            githubUsername: githubAuth?.username,
            repoUrl: access.sandboxAccess.repoUrl,
            sandboxId,
            terminalId,
          })
        )
        .catch((error: unknown) => {
          console.warn("Unable to refresh terminal GitHub auth.", error)
        })
    }

    return NextResponse.json(terminal, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to connect Daytona terminal.",
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  const body = (await request.json().catch(() => ({}))) as {
    action?: unknown
    cols?: unknown
    rows?: unknown
    sandboxId?: unknown
    terminalId?: unknown
  }
  const sandboxId = typeof body.sandboxId === "string" ? body.sandboxId : ""
  const terminalId = typeof body.terminalId === "string" ? body.terminalId : ""

  if (!sandboxId || !terminalId) {
    return terminalRequiredResponse()
  }

  const access = await requireTerminalAccess(sandboxId)
  if ("response" in access) return access.response

  if (body.action !== "resize") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 })
  }

  try {
    await resizeDaytonaTerminalWebSocket({
      cols: typeof body.cols === "number" ? body.cols : 100,
      rows: typeof body.rows === "number" ? body.rows : 30,
      sandboxId,
      terminalId,
    })
    void readDaytonaSandboxInfo(sandboxId)
      .then(observeCurrentUserDaytonaBillingInfo)
      .catch((error: unknown) => {
        console.warn("Unable to observe terminal resize billing.", error)
      })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to resize Daytona terminal.",
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  const body = (await request.json().catch(() => ({}))) as {
    sandboxId?: unknown
    terminalId?: unknown
  }
  const sandboxId = typeof body.sandboxId === "string" ? body.sandboxId : ""
  const terminalId = typeof body.terminalId === "string" ? body.terminalId : ""

  if (!sandboxId || !terminalId) {
    return terminalRequiredResponse()
  }

  const access = await requireTerminalAccess(sandboxId)
  if ("response" in access) return access.response

  await killDaytonaTerminal(sandboxId, terminalId)
  return NextResponse.json({ ok: true })
}
