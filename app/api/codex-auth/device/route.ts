import { NextRequest, NextResponse } from "next/server"

import {
  CODEX_AUTH_WINDOW_OPENAI_ICON,
  renderCodexAuthWindowDocument,
} from "@/lib/codex/auth-window-html"
import { getConvexAuthToken } from "@/lib/codex/auth"
import {
  CODEX_DEVICE_AUTH_COOKIE,
  CODEX_DEVICE_AUTH_COOKIE_PATH,
  completeCodexDeviceLogin,
  decodeCodexDeviceLoginSession,
} from "@/lib/codex/oauth"
import { requireSameOrigin } from "@/lib/http/request-security"
import { escapeHtml } from "@/lib/shared/html-escape"

export const runtime = "nodejs"

const CHATGPT_SECURITY_SETTINGS_URL = "https://chatgpt.com/#settings/Security"

function clearDeviceCookie(response: NextResponse) {
  response.cookies.set(CODEX_DEVICE_AUTH_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: CODEX_DEVICE_AUTH_COOKIE_PATH,
    sameSite: "lax",
  })
}

function getSession(request: NextRequest) {
  return decodeCodexDeviceLoginSession(
    request.cookies.get(CODEX_DEVICE_AUTH_COOKIE)?.value
  )
}

function devicePage({
  error,
  intervalSeconds,
  userCode,
  verificationUrl,
}: {
  error?: string
  intervalSeconds?: number
  userCode?: string
  verificationUrl?: string
}) {
  const escapedCode = userCode ? escapeHtml(userCode) : ""
  const escapedVerificationUrl = verificationUrl
    ? escapeHtml(verificationUrl)
    : ""
  const serializedIntervalMs = JSON.stringify(
    Math.max(1, intervalSeconds ?? 5) * 1000
  )
  const serializedHasSession = JSON.stringify(Boolean(userCode && !error))
  const serializedError = JSON.stringify(error ?? "")
  const securitySettingsUrl = escapeHtml(CHATGPT_SECURITY_SETTINGS_URL)

  const body = error
    ? `
      <div class="brand">${CODEX_AUTH_WINDOW_OPENAI_ICON}</div>
      <h1>ChatGPT sign-in failed</h1>
      <p class="subtitle error">${escapeHtml(error)}</p>`
    : `
      <div class="brand">${CODEX_AUTH_WINDOW_OPENAI_ICON}</div>
      <h1>Enter this code in ChatGPT</h1>
      <p class="subtitle">Open ChatGPT, enter the code below, and approve Codex access. This window updates automatically when sign-in finishes.</p>
      <code class="code">${escapedCode}</code>
      <div class="actions">
        <a class="btn" href="${escapedVerificationUrl}" target="_blank" rel="noopener noreferrer">Open ChatGPT</a>
        <button class="btn btn-secondary" type="button" id="copy-code">Copy code</button>
      </div>
      <p class="status" id="status">Waiting for approval…</p>
      <p class="hint">Not seeing a place to enter the code? Make sure device sign-in is enabled in your <a href="${securitySettingsUrl}" target="_blank" rel="noopener noreferrer">ChatGPT security settings</a>.</p>`

  const script = `
      const hasSession = ${serializedHasSession};
      const intervalMs = ${serializedIntervalMs};
      const initialError = ${serializedError};
      const authMessageType = "cloudcode:codex-auth";
      const channelName = "cloudcode:codex-auth";
      const statusEl = document.getElementById("status");
      const copyButton = document.getElementById("copy-code");
      let settled = false;

      function notify(message) {
        if ("BroadcastChannel" in window) {
          const channel = new BroadcastChannel(channelName);
          channel.postMessage(message);
          channel.close();
        }
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(message, window.location.origin);
        }
      }

      function finish(message) {
        if (settled) return;
        settled = true;
        notify(message);
        if (statusEl) {
          statusEl.textContent =
            message.status === "complete"
              ? "Connected. You can close this window."
              : message.error || "ChatGPT sign-in failed.";
          statusEl.className =
            message.status === "complete" ? "status" : "status error";
        }
        if (message.status === "complete") {
          window.setTimeout(() => window.close(), 700);
        }
      }

      if (copyButton) {
        copyButton.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(${JSON.stringify(userCode ?? "")});
            copyButton.textContent = "Copied";
            window.setTimeout(() => {
              copyButton.textContent = "Copy code";
            }, 1400);
          } catch {
            copyButton.textContent = "Copy failed";
          }
        });
      }

      async function poll() {
        if (!hasSession || settled) return;

        try {
          const response = await fetch("/api/codex-auth/device", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "content-type": "application/json",
            },
            body: "{}",
          });
          const payload = await response.json().catch(() => ({}));

          if (!response.ok) {
            finish({
              error: payload.error || "ChatGPT sign-in failed.",
              status: "error",
              type: authMessageType,
            });
            return;
          }

          if (payload.status === "complete") {
            finish({ status: "complete", type: authMessageType });
            return;
          }

          window.setTimeout(poll, payload.retryAfterMs || intervalMs);
        } catch {
          window.setTimeout(poll, intervalMs);
        }
      }

      if (initialError) {
        finish({ error: initialError, status: "error", type: authMessageType });
      } else {
        window.setTimeout(poll, intervalMs);
      }`

  return renderCodexAuthWindowDocument({
    body,
    script,
    title: "ChatGPT sign-in",
  })
}

function htmlResponse(html: string, status = 200) {
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
    status,
  })
}

export async function GET(request: NextRequest) {
  const session = getSession(request)

  if (!session || session.expiresAt < Date.now()) {
    const response = htmlResponse(
      devicePage({
        error: "ChatGPT sign-in expired. Start sign-in again.",
      }),
      400
    )
    clearDeviceCookie(response)
    return response
  }

  return htmlResponse(
    devicePage({
      intervalSeconds: session.intervalSeconds,
      userCode: session.userCode,
      verificationUrl: session.verificationUrl,
    })
  )
}

export async function POST(request: NextRequest) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  try {
    const session = getSession(request)
    if (!session) {
      return NextResponse.json(
        { error: "ChatGPT sign-in expired. Start sign-in again." },
        { status: 400 }
      )
    }

    const result = await completeCodexDeviceLogin({
      convexToken: await getConvexAuthToken(),
      session,
    })
    const response = NextResponse.json(result)

    if (result.status === "complete") {
      clearDeviceCookie(response)
    }

    return response
  } catch (error) {
    const response = NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "ChatGPT sign-in failed.",
      },
      { status: 400 }
    )
    clearDeviceCookie(response)
    return response
  }
}
