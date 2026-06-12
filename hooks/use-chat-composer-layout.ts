"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type UseChatComposerLayoutOptions = {
  defaultComposerHeight: number
  input: string
  isMobile: boolean
  measureComposer: boolean
  measureVersion: string
}

const TEXTAREA_HEIGHT = {
  desktopMax: 200,
  desktopMin: 80,
  mobileMax: 144,
  mobileMin: 64,
} as const

export function useChatComposerLayout({
  defaultComposerHeight,
  input,
  isMobile,
  measureComposer,
  measureVersion,
}: UseChatComposerLayoutOptions) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const [composerHeight, setComposerHeight] = useState(defaultComposerHeight)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return

    const minHeight = isMobile
      ? TEXTAREA_HEIGHT.mobileMin
      : TEXTAREA_HEIGHT.desktopMin
    const maxHeight = isMobile
      ? TEXTAREA_HEIGHT.mobileMax
      : TEXTAREA_HEIGHT.desktopMax

    el.style.height = "0px"
    el.style.height =
      Math.min(Math.max(el.scrollHeight, minHeight), maxHeight) + "px"
  }, [input, isMobile])

  useEffect(() => {
    const el = composerRef.current
    if (!el || !measureComposer) return

    const updateComposerHeight = () => {
      setComposerHeight(Math.ceil(el.getBoundingClientRect().height))
    }

    updateComposerHeight()
    const observer = new ResizeObserver(updateComposerHeight)
    observer.observe(el)

    return () => observer.disconnect()
  }, [measureComposer, measureVersion])

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  return {
    composerHeight,
    composerRef,
    focusComposer,
    textareaRef,
  }
}
