"use client"

import { type MouseEvent as ReactMouseEvent, useCallback, useRef } from "react"

export function useTerminalPanelResize({
  height,
  onHeightChange,
}: {
  height: number
  onHeightChange: (height: number) => void
}) {
  const dragStartRef = useRef<{ h: number; y: number } | null>(null)

  return useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      dragStartRef.current = { h: height, y: event.clientY }

      function onMove(moveEvent: MouseEvent) {
        const ctx = dragStartRef.current
        if (!ctx) return
        const next = Math.min(
          Math.max(260, ctx.h + (ctx.y - moveEvent.clientY)),
          Math.max(300, window.innerHeight - 180)
        )
        onHeightChange(next)
      }

      function onUp() {
        dragStartRef.current = null
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        document.body.style.removeProperty("cursor")
        document.body.style.removeProperty("user-select")
      }

      document.body.style.cursor = "row-resize"
      document.body.style.userSelect = "none"
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [height, onHeightChange]
  )
}
