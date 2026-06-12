"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { splitStreamingTokens } from "@/components/chat/streaming"
import type { LiveRunRecord } from "@/components/chat/types"

type LiveRevealState = {
  inactive?: boolean
  queue: string[]
  target: string
  timer?: ReturnType<typeof setTimeout>
  visible: string
}

export function useChatLiveRunReveal({
  isCurrentLiveRunSnapshot,
  shouldAnimateInitial,
  visibleLiveRun,
}: {
  isCurrentLiveRunSnapshot: boolean
  shouldAnimateInitial: boolean
  visibleLiveRun: LiveRunRecord | null
}) {
  const [revealedLiveRunContent, setRevealedLiveRunContent] = useState<
    Record<string, string>
  >({})
  const liveRevealRef = useRef<Record<string, LiveRevealState>>({})
  const previousRunKeyRef = useRef<string | null>(null)
  const runKey = visibleLiveRun ? (visibleLiveRun.runId as string) : null
  const target = visibleLiveRun?.content ?? ""

  const revealNextLiveToken = useCallback(function revealNextLiveToken(
    key: string
  ) {
    const state = liveRevealRef.current[key]
    if (!state) return

    const token = state.queue.shift()
    if (token === undefined) {
      state.timer = undefined
      return
    }

    state.visible += token
    setRevealedLiveRunContent((current) =>
      current[key] === state.visible
        ? current
        : { ...current, [key]: state.visible }
    )

    const isToolMarker = token.startsWith("<codex-tool>")
    const delay = isToolMarker ? 0 : token.trim() ? 16 : 4
    state.timer = setTimeout(() => revealNextLiveToken(key), delay)
  }, [])

  const scheduleLiveReveal = useCallback(
    (key: string) => {
      const state = liveRevealRef.current[key]
      if (!state || state.timer) return
      state.inactive = false
      state.timer = setTimeout(() => revealNextLiveToken(key), 0)
    },
    [revealNextLiveToken]
  )

  const finishLiveReveal = useCallback((key: string, inactive: boolean) => {
    const state = liveRevealRef.current[key]
    if (!state) return

    if (state.timer) clearTimeout(state.timer)
    state.inactive = inactive
    state.queue = []
    state.timer = undefined
    state.visible = state.target
    setRevealedLiveRunContent((current) =>
      current[key] === state.visible
        ? current
        : { ...current, [key]: state.visible }
    )
  }, [])

  const clearLiveRevealTimers = useCallback(() => {
    for (const state of Object.values(liveRevealRef.current)) {
      if (state.timer) clearTimeout(state.timer)
    }
  }, [])

  useEffect(() => {
    const previousRunKey = previousRunKeyRef.current
    if (previousRunKey && previousRunKey !== runKey) {
      finishLiveReveal(previousRunKey, true)
    }
    previousRunKeyRef.current = runKey
  }, [finishLiveReveal, runKey])

  useEffect(() => {
    if (!runKey) return

    const current = liveRevealRef.current[runKey]

    if (!current) {
      if (target && !shouldAnimateInitial) {
        liveRevealRef.current[runKey] = {
          queue: [],
          target,
          visible: target,
        }
        setRevealedLiveRunContent((state) => ({ ...state, [runKey]: target }))
        return
      }

      liveRevealRef.current[runKey] = {
        inactive: false,
        queue: splitStreamingTokens(target),
        target,
        visible: "",
      }
      scheduleLiveReveal(runKey)
      return
    }

    if (current.inactive) {
      if (current.timer) clearTimeout(current.timer)
      current.inactive = !isCurrentLiveRunSnapshot
      current.queue = []
      current.target = target
      current.timer = undefined
      current.visible = target
      setRevealedLiveRunContent((state) =>
        state[runKey] === target ? state : { ...state, [runKey]: target }
      )
      return
    }

    if (current.target === target) return

    if (!target.startsWith(current.visible)) {
      if (current.timer) clearTimeout(current.timer)
      liveRevealRef.current[runKey] = {
        inactive: false,
        queue: [],
        target,
        visible: target,
      }
      setRevealedLiveRunContent((state) => ({ ...state, [runKey]: target }))
      return
    }

    current.target = target
    current.queue = splitStreamingTokens(target.slice(current.visible.length))
    scheduleLiveReveal(runKey)
  }, [
    isCurrentLiveRunSnapshot,
    runKey,
    scheduleLiveReveal,
    shouldAnimateInitial,
    target,
  ])

  useEffect(() => clearLiveRevealTimers, [clearLiveRevealTimers])

  return revealedLiveRunContent
}
