import { NextRequest, NextResponse } from "next/server"

import { getConvexAuthToken } from "@/lib/codex/auth"
import {
  CODEX_OAUTH_STATE_COOKIE,
  CODEX_OAUTH_STATE_COOKIE_PATH,
  codexOAuthErrorMessage,
  completeCodexLogin,
} from "@/lib/codex/oauth"
import { escapeHtml } from "@/lib/shared/html-escape"

export const runtime = "nodejs"

function html(message: string, status = 400) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Cloudcode Auth</title><body style="font-family:system-ui;padding:2rem;line-height:1.5;max-width:42rem"><h1 style="font-size:1.25rem">ChatGPT sign-in failed</h1><p>${escapeHtml(message)}</p><p><a href="/">Return to Cloudcode</a></p></body>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
      status,
    }
  )
}

function clearStateCookie(response: NextResponse) {
  response.cookies.set(CODEX_OAUTH_STATE_COOKIE, "", {
    maxAge: 0,
    path: CODEX_OAUTH_STATE_COOKIE_PATH,
  })
  return response
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const error = codexOAuthErrorMessage(url)

  if (error) {
    return clearStateCookie(html(error))
  }

  const code = url.searchParams.get("code")
  const returnedState = url.searchParams.get("state")

  if (!code || !returnedState) {
    return clearStateCookie(
      html("Missing ChatGPT authorization code or state.")
    )
  }

  try {
    const convexToken = await getConvexAuthToken()
    const completed = await completeCodexLogin({
      code,
      convexToken,
      requestOrigin: url.origin,
      returnedState,
      stateCookie: request.cookies.get(CODEX_OAUTH_STATE_COOKIE)?.value,
    })

    return clearStateCookie(NextResponse.redirect(completed.returnUrl))
  } catch (error) {
    return clearStateCookie(
      html(
        error instanceof Error
          ? error.message
          : "Unable to finish ChatGPT sign-in."
      )
    )
  }
}
