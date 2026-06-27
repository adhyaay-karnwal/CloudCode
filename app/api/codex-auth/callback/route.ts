import { NextRequest, NextResponse } from "next/server"

import { getConvexAuthToken } from "@/lib/codex/auth"
import {
  CODEX_OAUTH_STATE_COOKIE,
  CODEX_OAUTH_STATE_COOKIE_PATH,
  codexOAuthPopupHtml,
  completeCodexHostedOAuthLogin,
  decodeCodexHostedOAuthSession,
} from "@/lib/codex/oauth"

export const runtime = "nodejs"

type PopupResult = {
  error?: string
  message: string
  status: "complete" | "error"
  targetOrigin: string
  title: string
}

function resultResponse(result: PopupResult, init?: ResponseInit) {
  const response = new NextResponse(codexOAuthPopupHtml(result), {
    ...init,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  })

  response.cookies.set(CODEX_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: CODEX_OAUTH_STATE_COOKIE_PATH,
    sameSite: "lax",
  })

  return response
}

function errorResponse({
  message,
  status = 400,
  targetOrigin,
}: {
  message: string
  status?: number
  targetOrigin: string
}) {
  return resultResponse(
    {
      error: message,
      message,
      status: "error",
      targetOrigin,
      title: "ChatGPT sign-in failed",
    },
    { status }
  )
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  let targetOrigin = url.origin

  try {
    const session = decodeCodexHostedOAuthSession(
      request.cookies.get(CODEX_OAUTH_STATE_COOKIE)?.value
    )
    targetOrigin = session?.appOrigin ?? url.origin

    if (!session) {
      return errorResponse({
        message: "ChatGPT sign-in state was not recognized. Please try again.",
        targetOrigin,
      })
    }

    if (Date.now() > session.expiresAt) {
      return errorResponse({
        message: "ChatGPT sign-in expired. Please try again.",
        targetOrigin,
      })
    }

    const oauthError =
      url.searchParams.get("error_description") ?? url.searchParams.get("error")
    if (oauthError) {
      return errorResponse({
        message: oauthError,
        targetOrigin,
      })
    }

    const state = url.searchParams.get("state")
    if (!state || state !== session.state) {
      return errorResponse({
        message: "ChatGPT sign-in state did not match. Please try again.",
        targetOrigin,
      })
    }

    const code = url.searchParams.get("code")
    if (!code) {
      return errorResponse({
        message: "ChatGPT sign-in did not return an OAuth code.",
        targetOrigin,
      })
    }

    await completeCodexHostedOAuthLogin({
      code,
      convexToken: await getConvexAuthToken(),
      session,
    })

    return resultResponse({
      message: "ChatGPT is connected. You can close this window.",
      status: "complete",
      targetOrigin,
      title: "ChatGPT connected",
    })
  } catch (error) {
    return errorResponse({
      message:
        error instanceof Error ? error.message : "ChatGPT sign-in failed.",
      status: 500,
      targetOrigin,
    })
  }
}
