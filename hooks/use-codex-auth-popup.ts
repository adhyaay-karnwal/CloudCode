"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type CodexAuthPopupMessage = {
  error?: string
  status: "complete" | "error"
  type: "cloudcode:codex-auth"
}

function popupFeatures() {
  const width = 520
  const height = 720
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)

  return [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${Math.round(left)}`,
    `top=${Math.round(top)}`,
    "resizable=yes",
    "scrollbars=yes",
  ].join(",")
}

function isCodexAuthPopupMessage(
  value: unknown
): value is CodexAuthPopupMessage {
  if (!value || typeof value !== "object") {
    return false
  }

  const message = value as Partial<CodexAuthPopupMessage>

  return (
    message.type === "cloudcode:codex-auth" &&
    (message.status === "complete" || message.status === "error")
  )
}

function trustedCodexAuthOrigin(origin: string) {
  if (origin === window.location.origin) {
    return true
  }

  return /^http:\/\/(?:localhost|127\.0\.0\.1):(?:1455|1457)$/.test(origin)
}

export function useCodexAuthPopup({
  onComplete,
}: {
  onComplete: () => void | Promise<void>
}) {
  const [error, setError] = useState("")
  const [opening, setOpening] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)
  const settledRef = useRef(false)

  const cleanup = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
  }, [])

  useEffect(() => cleanup, [cleanup])

  const start = useCallback(() => {
    if (opening) return

    cleanup()
    settledRef.current = false
    setError("")
    setOpening(true)

    const popup = window.open(
      "/api/codex-auth/login",
      "cloudcode-chatgpt-login",
      popupFeatures()
    )

    if (!popup) {
      setError("Popup blocked. Allow popups for Cloudcode and try again.")
      setOpening(false)
      return
    }

    popup.focus()

    const finish = () => {
      cleanup()
      setOpening(false)
    }

    const handleMessage = (event: MessageEvent) => {
      if (
        !trustedCodexAuthOrigin(event.origin) ||
        !isCodexAuthPopupMessage(event.data) ||
        settledRef.current
      ) {
        return
      }

      settledRef.current = true
      finish()

      if (event.data.status === "error") {
        setError(event.data.error ?? "ChatGPT sign-in failed.")
        return
      }

      void Promise.resolve(onComplete()).catch((completeError: unknown) => {
        setError(
          completeError instanceof Error
            ? completeError.message
            : "ChatGPT connected, but Cloudcode could not refresh the connection status."
        )
      })
    }

    const closedInterval = window.setInterval(() => {
      if (!popup.closed || settledRef.current) {
        return
      }

      settledRef.current = true
      finish()
      setError("Sign-in window closed before completion.")
    }, 500)

    window.addEventListener("message", handleMessage)
    cleanupRef.current = () => {
      window.clearInterval(closedInterval)
      window.removeEventListener("message", handleMessage)
    }
  }, [cleanup, onComplete, opening])

  return { error, opening, start }
}
