"use client"

import { useEffect, useRef, type RefObject } from "react"

export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
  onClickOutside: () => void
) {
  const onClickOutsideRef = useRef(onClickOutside)
  onClickOutsideRef.current = onClickOutside

  useEffect(() => {
    if (!active) return

    function onMouseDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        onClickOutsideRef.current()
      }
    }

    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [active, ref])
}
