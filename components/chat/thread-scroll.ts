"use client"

import {
  type UIEvent as ReactUIEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

type ThreadScrollSnapshot = {
  atBottom: boolean
  runKey: string
  scrollTop: number
}

// Time constant (ms) for the eased follow. The per-frame fraction is derived
// from real elapsed time, so the glide feels identical at 60Hz and 120Hz.
// Higher = gentler/slower settle.
const EASE_TAU_MS = 105

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

export function useChatThreadScroll({
  activeRunKey,
  empty,
  isMobile,
  onActiveThreadReset,
  threadBottomInset,
  threadContentVersion,
}: {
  activeRunKey: string
  empty: boolean
  isMobile: boolean
  onActiveThreadReset: () => void
  threadBottomInset: number
  threadContentVersion: string
}) {
  const threadRef = useRef<HTMLDivElement | null>(null)
  const isAtBottomRef = useRef(true)
  const promptFocusedRef = useRef(false)
  const pendingRestoreRef = useRef<ThreadScrollSnapshot | null>(null)
  const pendingRestoreFrameRef = useRef<number | null>(null)
  // Eased auto-follow: a rAF loop that walks scrollTop toward the bottom so
  // streaming output glides into view instead of snapping. `easeActiveRef`
  // marks the loop as the scroll source so its own scroll events are not
  // mistaken for the user scrolling away.
  const easeFrameRef = useRef<number | null>(null)
  const easeActiveRef = useRef(false)
  const lastEaseTopRef = useRef(0)
  // New, unread output that arrived while the user was scrolled up. Drives the
  // minimal "jump to latest" pill.
  const [showNewActivity, setShowNewActivity] = useState(false)

  const isThreadAtBottom = useCallback((el: HTMLDivElement) => {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  const scrollThreadToBottom = useCallback(() => {
    const el = threadRef.current
    if (!el) return
    el.style.scrollBehavior = "auto"
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
    isAtBottomRef.current = true
  }, [])

  const cancelEase = useCallback(() => {
    if (easeFrameRef.current !== null) {
      cancelAnimationFrame(easeFrameRef.current)
      easeFrameRef.current = null
    }
    easeActiveRef.current = false
  }, [])

  const easeThreadToBottom = useCallback(() => {
    const el = threadRef.current
    if (!el) return
    // Reduced motion (or no animation budget): jump straight to the bottom.
    if (prefersReducedMotion()) {
      cancelEase()
      scrollThreadToBottom()
      return
    }
    // One continuous loop. While streaming, content updates call this every
    // bump; restarting the rAF each time resets the smoothing and reads
    // scrollHeight mid-commit (a forced reflow) — both cause the choppiness.
    // If the loop is already running, just let it keep chasing the new bottom.
    if (easeActiveRef.current) return
    easeActiveRef.current = true
    let lastTs = 0
    const step = (now: number) => {
      const node = threadRef.current
      if (!node) {
        cancelEase()
        return
      }
      const target = Math.max(0, node.scrollHeight - node.clientHeight)
      node.style.scrollBehavior = "auto"
      const remaining = target - node.scrollTop
      if (remaining < 0.5) {
        node.scrollTop = target
        lastEaseTopRef.current = target
        isAtBottomRef.current = true
        easeFrameRef.current = null
        easeActiveRef.current = false
        return
      }
      if (remaining > node.clientHeight) {
        // A large gap — entering a thread, the skeleton being replaced, a huge
        // block landing — snaps so we never do a long visible scroll.
        node.scrollTop = target
        lastTs = now
        lastEaseTopRef.current = node.scrollTop
        easeFrameRef.current = requestAnimationFrame(step)
        return
      }
      // Frame-rate independent exponential smoothing toward the (moving) bottom.
      const dt = lastTs ? now - lastTs : 16.7
      lastTs = now
      const factor = 1 - Math.exp(-dt / EASE_TAU_MS)
      node.scrollTop = node.scrollTop + remaining * factor
      lastEaseTopRef.current = node.scrollTop
      easeFrameRef.current = requestAnimationFrame(step)
    }
    easeFrameRef.current = requestAnimationFrame(step)
  }, [cancelEase, scrollThreadToBottom])

  const settleThreadAtBottom = useCallback(() => {
    if (isMobile && promptFocusedRef.current) return

    isAtBottomRef.current = true
    scrollThreadToBottom()

    requestAnimationFrame(() => {
      if (isMobile && promptFocusedRef.current) return
      scrollThreadToBottom()
      requestAnimationFrame(() => {
        if (isMobile && promptFocusedRef.current) return
        scrollThreadToBottom()
      })
    })
  }, [isMobile, scrollThreadToBottom])

  const cancelPendingRestoreFrame = useCallback(() => {
    if (pendingRestoreFrameRef.current === null) return
    cancelAnimationFrame(pendingRestoreFrameRef.current)
    pendingRestoreFrameRef.current = null
  }, [])

  const captureThreadScrollForPanel = useCallback(() => {
    const el = threadRef.current
    if (!el) return

    cancelPendingRestoreFrame()

    pendingRestoreRef.current = {
      atBottom: isThreadAtBottom(el),
      runKey: activeRunKey,
      scrollTop: el.scrollTop,
    }
  }, [activeRunKey, cancelPendingRestoreFrame, isThreadAtBottom])

  const restoreThreadScrollForPanel = useCallback(
    (el: HTMLDivElement) => {
      const snapshot = pendingRestoreRef.current
      if (!snapshot || snapshot.runKey !== activeRunKey) return false

      const applyScroll = () => {
        el.style.scrollBehavior = "auto"
        el.scrollTop = snapshot.atBottom
          ? Math.max(0, el.scrollHeight - el.clientHeight)
          : Math.min(
              snapshot.scrollTop,
              Math.max(0, el.scrollHeight - el.clientHeight)
            )
        isAtBottomRef.current = snapshot.atBottom
      }

      cancelPendingRestoreFrame()

      applyScroll()
      pendingRestoreFrameRef.current = requestAnimationFrame(() => {
        applyScroll()
        pendingRestoreFrameRef.current = requestAnimationFrame(() => {
          applyScroll()
          if (pendingRestoreRef.current === snapshot) {
            pendingRestoreRef.current = null
          }
          pendingRestoreFrameRef.current = null
        })
      })

      return true
    },
    [activeRunKey, cancelPendingRestoreFrame]
  )

  const onThreadScroll = useCallback(
    (event: ReactUIEvent<HTMLDivElement>) => {
      const el = event.currentTarget
      // While the ease loop owns the scroll, ignore its own events — unless the
      // user scrolls up past where the loop left off, which hands control back.
      if (easeActiveRef.current) {
        if (el.scrollTop < lastEaseTopRef.current - 2) {
          cancelEase()
          isAtBottomRef.current = false
        }
        return
      }
      const atBottom = isThreadAtBottom(el)
      isAtBottomRef.current = atBottom
      if (atBottom) setShowNewActivity(false)
    },
    [cancelEase, isThreadAtBottom]
  )

  const scrollToLatest = useCallback(() => {
    setShowNewActivity(false)
    isAtBottomRef.current = true
    easeThreadToBottom()
  }, [easeThreadToBottom])

  const setThreadElement = useCallback(
    (el: HTMLDivElement | null) => {
      threadRef.current = el
      if (el) {
        if (!restoreThreadScrollForPanel(el)) {
          settleThreadAtBottom()
        }
      }
    },
    [restoreThreadScrollForPanel, settleThreadAtBottom]
  )

  const setPromptFocused = useCallback((focused: boolean) => {
    promptFocusedRef.current = focused
  }, [])

  useLayoutEffect(() => {
    // Switching threads starts fresh: drop any in-flight ease and unread state,
    // then snap to the bottom instantly (a thread should open already settled).
    setShowNewActivity(false)
    cancelEase()
    if (isMobile && empty) return
    cancelPendingRestoreFrame()
    pendingRestoreRef.current = null
    onActiveThreadReset()
    settleThreadAtBottom()
  }, [
    activeRunKey,
    cancelEase,
    cancelPendingRestoreFrame,
    empty,
    isMobile,
    onActiveThreadReset,
    settleThreadAtBottom,
  ])

  useLayoutEffect(() => {
    return () => {
      cancelPendingRestoreFrame()
      cancelEase()
    }
  }, [cancelEase, cancelPendingRestoreFrame])

  useLayoutEffect(() => {
    if (isMobile && promptFocusedRef.current) return
    if (!isAtBottomRef.current) return
    settleThreadAtBottom()
  }, [isMobile, settleThreadAtBottom, threadBottomInset])

  // New content arrived. If the user is following the bottom, make sure the
  // ease loop is running (it chases the bottom and snaps large jumps itself);
  // otherwise flag unread activity for the pill. No scrollHeight read here, so
  // streaming never forces a reflow during the commit.
  useLayoutEffect(() => {
    if (isMobile && promptFocusedRef.current) return
    if (isAtBottomRef.current) {
      easeThreadToBottom()
    } else {
      setShowNewActivity(true)
    }
  }, [easeThreadToBottom, isMobile, threadContentVersion])

  return {
    captureThreadScrollForPanel,
    onThreadScroll,
    scrollToLatest,
    setPromptFocused,
    setThreadElement,
    showNewActivity,
  }
}
