"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type SandboxInfo = {
  autoStopInterval: number | null
  lastActivityAt: number | null
  sandboxId?: string
  rawState?: string
  state: "running" | "stopped" | "deleted" | "error"
}

export const SANDBOX_STATE_LABEL: Record<SandboxInfo["state"], string> = {
  deleted: "Deleted",
  error: "Error",
  running: "Running",
  stopped: "Idle",
}

export function formatSandboxAutoStop(value: number | null) {
  if (value === null) return "Daytona managed"
  if (value === 0) return "No auto-stop"
  if (value < 60) return `${value}m auto-stop`
  const hours = Math.round((value / 60) * 10) / 10
  return `${hours}h auto-stop`
}

function parseSandboxInfo(data: Record<string, unknown>): SandboxInfo {
  return {
    autoStopInterval:
      typeof data.autoStopInterval === "number" ? data.autoStopInterval : null,
    lastActivityAt:
      typeof data.lastActivityAt === "number" ? data.lastActivityAt : null,
    rawState: typeof data.rawState === "string" ? data.rawState : "",
    sandboxId: typeof data.sandboxId === "string" ? data.sandboxId : undefined,
    state:
      data.state === "stopped" ||
      data.state === "deleted" ||
      data.state === "error"
        ? data.state
        : "running",
  }
}

async function fetchSandboxInfo(sandboxId: string, signal?: AbortSignal) {
  const res = await fetch(
    `/api/sandbox/info?sandboxId=${encodeURIComponent(sandboxId)}`,
    { cache: "no-store", signal }
  )
  const data = (await res.json()) as Record<string, unknown>

  if (!res.ok) {
    return {
      info: null,
      notFound: Boolean(data?.notFound),
    }
  }

  return {
    info: parseSandboxInfo(data),
    notFound: false,
  }
}

export type UseSandboxInfoResult = {
  info: SandboxInfo | null
  loading: boolean
  missing: boolean
  refresh: () => Promise<void>
}

export function useSandboxInfo({
  onMissing,
  onStateChange,
  sandboxId,
}: {
  onMissing?: (sandboxId: string) => void
  onStateChange?: (
    state: SandboxInfo["state"],
    sandboxId: string,
    info: SandboxInfo
  ) => void
  sandboxId: string | null
}): UseSandboxInfoResult {
  const [info, setInfo] = useState<SandboxInfo | null>(null)
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const onMissingRef = useRef(onMissing)
  const onStateChangeRef = useRef(onStateChange)
  const manualRefreshControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    onMissingRef.current = onMissing
    onStateChangeRef.current = onStateChange
  }, [onMissing, onStateChange])

  const applyInfo = useCallback((nextInfo: SandboxInfo) => {
    setMissing(false)
    setInfo(nextInfo)
    setLoading(false)
    if (nextInfo.sandboxId) {
      onStateChangeRef.current?.(nextInfo.state, nextInfo.sandboxId, nextInfo)
    }
  }, [])

  const applyMissing = useCallback((missingSandboxId: string) => {
    setInfo(null)
    setMissing(true)
    setLoading(false)
    onMissingRef.current?.(missingSandboxId)
  }, [])

  const load = useCallback(
    async (
      nextSandboxId: string,
      options?: {
        signal?: AbortSignal
        showLoading?: boolean
      }
    ) => {
      if (options?.showLoading) setLoading(true)

      try {
        const result = await fetchSandboxInfo(nextSandboxId, options?.signal)
        if (options?.signal?.aborted) return

        if (result.notFound) {
          applyMissing(nextSandboxId)
          return
        }

        if (result.info) applyInfo(result.info)
      } catch {
        if (!options?.signal?.aborted) setMissing(false)
      } finally {
        if (!options?.signal?.aborted) setLoading(false)
      }
    },
    [applyInfo, applyMissing]
  )

  const refresh = useCallback(async () => {
    if (!sandboxId) return

    manualRefreshControllerRef.current?.abort()
    const controller = new AbortController()
    manualRefreshControllerRef.current = controller

    try {
      await load(sandboxId, {
        signal: controller.signal,
        showLoading: true,
      })
    } finally {
      if (manualRefreshControllerRef.current === controller) {
        manualRefreshControllerRef.current = null
      }
    }
  }, [load, sandboxId])

  useEffect(() => {
    return () => {
      manualRefreshControllerRef.current?.abort()
      manualRefreshControllerRef.current = null
    }
  }, [sandboxId])

  useEffect(() => {
    const controller = new AbortController()
    let fallbackInterval: number | undefined

    function applyStreamInfo(nextInfo: SandboxInfo) {
      setMissing(false)
      setInfo(nextInfo)
      setLoading(false)
      if (nextInfo.sandboxId) {
        onStateChangeRef.current?.(nextInfo.state, nextInfo.sandboxId, nextInfo)
      }
    }

    if (!sandboxId) {
      setInfo(null)
      setMissing(false)
      setLoading(false)
      return
    }

    const source = new EventSource(
      `/api/sandbox/status?sandboxId=${encodeURIComponent(sandboxId)}`
    )

    source.onmessage = (event) => {
      if (controller.signal.aborted) return
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>
        if (data.notFound) {
          applyMissing(sandboxId)
          source.close()
          return
        }
        applyStreamInfo(parseSandboxInfo(data))
      } catch {
        // Ignore malformed stream events and let the next status event repair it.
      }
    }

    source.onerror = () => {
      if (controller.signal.aborted || fallbackInterval) return
      source.close()
      void load(sandboxId, { signal: controller.signal })
      fallbackInterval = window.setInterval(() => {
        void load(sandboxId, { signal: controller.signal })
      }, 2_000)
    }

    return () => {
      controller.abort()
      source.close()
      if (fallbackInterval) window.clearInterval(fallbackInterval)
    }
  }, [applyMissing, load, sandboxId])

  return { info, loading, missing, refresh }
}
