import { NextRequest, NextResponse } from "next/server"

import { getConvexAuthToken } from "@/lib/codex/auth"
import {
  CODEX_DEVICE_AUTH_COOKIE,
  CODEX_DEVICE_AUTH_COOKIE_PATH,
  createCodexDeviceLoginSession,
  createCodexOAuthLoginUrl,
  encodeCodexDeviceLoginSession,
} from "@/lib/codex/oauth"
import { escapeHtml } from "@/lib/shared/html-escape"

export const runtime = "nodejs"

function html(message: string) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Cloudcode Auth</title><body style="font-family:system-ui;padding:2rem;line-height:1.5;max-width:42rem"><h1 style="font-size:1.25rem">ChatGPT sign-in could not start</h1><p>${escapeHtml(message)}</p><p><a href="/?view=settings">Open Settings</a></p></body>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
      status: 400,
    }
  )
}

function loopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase()

  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  )
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const convexToken = await getConvexAuthToken()

    if (!loopbackHost(url.hostname)) {
      const session = await createCodexDeviceLoginSession()
      const response = NextResponse.redirect(
        new URL("/api/codex-auth/device", url.origin)
      )

      response.cookies.set(
        CODEX_DEVICE_AUTH_COOKIE,
        encodeCodexDeviceLoginSession(session),
        {
          httpOnly: true,
          maxAge: Math.ceil((session.expiresAt - Date.now()) / 1000),
          path: CODEX_DEVICE_AUTH_COOKIE_PATH,
          sameSite: "lax",
          secure: url.protocol === "https:",
        }
      )

      return response
    }

    const loginUrl = await createCodexOAuthLoginUrl({
      appOrigin: url.origin,
      convexToken,
    })

    return NextResponse.redirect(loginUrl)
  } catch (error) {
    return html(
      error instanceof Error
        ? error.message
        : "Unable to start ChatGPT sign-in."
    )
  }
}
