import { NextRequest, NextResponse } from "next/server"

import { getConvexAuthToken } from "@/lib/codex/auth"
import {
  CODEX_DEVICE_AUTH_COOKIE,
  CODEX_DEVICE_AUTH_COOKIE_PATH,
  completeCodexDeviceLogin,
  decodeCodexDeviceLoginSession,
  type CodexDeviceLoginSession,
} from "@/lib/codex/oauth"
import { requireSameOrigin } from "@/lib/http/request-security"
import { escapeHtml } from "@/lib/shared/html-escape"

export const runtime = "nodejs"

function clearDeviceCookie(response: NextResponse) {
  response.cookies.set(CODEX_DEVICE_AUTH_COOKIE, "", {
    maxAge: 0,
    path: CODEX_DEVICE_AUTH_COOKIE_PATH,
  })
}

function deviceSession(request: NextRequest) {
  return decodeCodexDeviceLoginSession(
    request.cookies.get(CODEX_DEVICE_AUTH_COOKIE)?.value
  )
}

function html(body: string, status = 200) {
  return new NextResponse(body, {
    headers: {
      "Cache-Control": "no-store, private",
      "content-type": "text/html; charset=utf-8",
    },
    status,
  })
}

function expiredHtml() {
  return html(
    `<!doctype html><meta charset="utf-8"><title>Cloudcode Auth</title><body style="font-family:system-ui;padding:2rem;line-height:1.5;max-width:42rem"><h1 style="font-size:1.25rem">ChatGPT sign-in expired</h1><p>Start ChatGPT sign-in again from Cloudcode Settings.</p><p><a href="/?view=settings">Open Settings</a></p></body>`,
    400
  )
}

function deviceHtml(session: CodexDeviceLoginSession) {
  const pollDelayMs = Math.max(1000, session.intervalSeconds * 1000)
  const verificationUrl = session.verificationUrl
  const userCode = session.userCode

  return html(`<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cloudcode Auth</title>
<body style="font-family:system-ui;padding:2rem;line-height:1.5;max-width:42rem">
  <h1 style="font-size:1.25rem">Sign in with ChatGPT</h1>
  <p>Open ChatGPT sign-in, enter this code, then keep this Cloudcode tab open while the account is saved.</p>
  <p><a href="${escapeHtml(verificationUrl)}" target="_blank" rel="noreferrer" style="display:inline-block;border-radius:0.5rem;background:#111;color:#fff;padding:0.625rem 0.875rem;text-decoration:none">Open ChatGPT sign-in</a></p>
  <pre style="display:inline-block;border:1px solid #ddd;border-radius:0.5rem;background:#f7f7f7;padding:0.75rem 1rem;font-size:1.25rem;letter-spacing:0.08em">${escapeHtml(userCode)}</pre>
  <p id="status" style="color:#666">Waiting for ChatGPT authorization...</p>
  <p><a href="/?view=settings">Back to Settings</a></p>
  <script>
    const statusEl = document.getElementById("status");
    let stopped = false;
    async function poll() {
      if (stopped) return;
      try {
        const response = await fetch("/api/codex-auth/device", {
          method: "POST",
          headers: { "content-type": "application/json" },
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.status === "complete") {
          stopped = true;
          statusEl.textContent = "ChatGPT connected. Returning to Cloudcode...";
          window.location.href = data.redirectTo || "/?view=settings";
          return;
        }
        if (response.status !== 202 && data.error) {
          stopped = true;
          statusEl.textContent = data.error;
          return;
        }
        window.setTimeout(poll, Math.max(${pollDelayMs}, Number(data.retryAfterMs) || 0));
      } catch {
        window.setTimeout(poll, ${pollDelayMs});
      }
    }
    window.setTimeout(poll, ${pollDelayMs});
  </script>
</body>`)
}

export async function GET(request: NextRequest) {
  const session = deviceSession(request)

  if (!session || session.expiresAt < Date.now()) {
    const response = expiredHtml()
    clearDeviceCookie(response)
    return response
  }

  return deviceHtml(session)
}

export async function POST(request: NextRequest) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  const session = deviceSession(request)

  if (!session || session.expiresAt < Date.now()) {
    const response = NextResponse.json(
      { error: "ChatGPT sign-in expired. Start sign-in again." },
      { status: 400 }
    )
    clearDeviceCookie(response)
    return response
  }

  try {
    const result = await completeCodexDeviceLogin({
      convexToken: await getConvexAuthToken(),
      session,
    })

    if (result.status === "pending") {
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store, private" },
        status: 202,
      })
    }

    const response = NextResponse.json(
      {
        redirectTo: "/?view=settings",
        status: "complete",
      },
      {
        headers: { "Cache-Control": "no-store, private" },
      }
    )
    clearDeviceCookie(response)
    return response
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete ChatGPT sign-in.",
      },
      { status: 400 }
    )
  }
}
