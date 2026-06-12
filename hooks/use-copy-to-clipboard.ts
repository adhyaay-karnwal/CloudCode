"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export function useCopyToClipboard(resetDelayMs = 1500) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCopyTimer = useCallback(() => {
    if (!timerRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  useEffect(() => clearCopyTimer, [clearCopyTimer])

  const copy = useCallback(
    (value: string) => {
      void navigator.clipboard
        ?.writeText(value)
        .then(() => {
          setCopied(true)
          clearCopyTimer()
          timerRef.current = setTimeout(() => setCopied(false), resetDelayMs)
        })
        .catch(() => undefined)
    },
    [clearCopyTimer, resetDelayMs]
  )

  return { copied, copy }
}
