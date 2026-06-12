"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type AnchoredRightMenuPosition = {
  top: number
  right: number
}

export function useAnchoredRightMenu({
  offset = 6,
  minRight = 8,
}: {
  offset?: number
  minRight?: number
} = {}) {
  const [menuPos, setMenuPos] = useState<AnchoredRightMenuPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const open = menuPos !== null

  const closeMenu = useCallback(() => {
    setMenuPos(null)
  }, [])

  const openMenu = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPos({
      top: rect.bottom + offset,
      right: Math.max(minRight, window.innerWidth - rect.right),
    })
  }, [minRight, offset])

  const toggleMenu = useCallback(() => {
    if (open) {
      closeMenu()
      return
    }
    openMenu()
  }, [closeMenu, open, openMenu])

  useEffect(() => {
    if (!open) return
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") closeMenu()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [closeMenu, open])

  return {
    closeMenu,
    menuPos,
    open,
    openMenu,
    toggleMenu,
    triggerRef,
  }
}
