import { schedules, task, timeout, usage } from "@trigger.dev/sdk"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { ensureAutoEnvironmentSandbox } from "@/lib/sandbox-auto-environment"
import { runCodexInSandbox, type RunCodexLog } from "@/lib/daytona-codex-agent"
import {
  daytonaSandboxBillingResources,
  getDaytonaSandbox,
  stopDaytonaSandbox,
} from "@/lib/daytona-sandbox"
import { inlineToolMarker, shouldPersistRunLog } from "@/lib/codex-run-log"
import {
  appendWorkerRunLogs,
  cancelWorkerRun,
  completeWorkerRun,
  failWorkerRun,
  getWorkerSecret,
  isWorkerRunCanceledError,
  observeWorkerDaytonaSandbox,
  recordWorkerBillingUsage,
  saveWorkerAuthJson,
  startAndLoadWorkerRun,
  syncWorkerMcpServerTools,
  updateWorkerRunContent,
  workerConvexClient,
  workerRunFinalContent,
  type WorkerRunPayload,
} from "@/lib/codex-run-worker"
import {
  BILLING_TRIGGER_CHECKPOINT_MS,
  daytonaBillingState,
  microUsdFromTriggerCents,
  type DaytonaBillingState,
} from "@/lib/billing"

const LOG_BATCH_SIZE = 20
const LOG_FLUSH_DELAY_MS = 350
const CONTENT_FLUSH_CHAR_THRESHOLD = 32
const CONTENT_FLUSH_DELAY_MS = 80
const FINAL_FLUSH_TIMEOUT_MS = 5_000
const MUTATION_RETRY_DELAYS_MS = [100, 300, 900]

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Codex run failed."
}

function sandboxIdFromLog(log: RunCodexLog) {
  if (log.kind !== "setup" || !log.detail) {
    return undefined
  }

  return log.message === "Daytona sandbox ready" ||
    log.message === "Recovered with a fresh Daytona sandbox"
    ? log.detail
    : undefined
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createBillingAbortController(signal: AbortSignal) {
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  if (signal.aborted) abort()
  signal.addEventListener("abort", abort, { once: true })
  return {
    abort: (reason?: unknown) => controller.abort(reason),
    cleanup: () => signal.removeEventListener("abort", abort),
    signal: controller.signal,
  }
}

async function withMutationRetries<T>(
  label: string,
  operation: () => Promise<T>
) {
  const attemptOperation = async (attempt: number): Promise<T> => {
    try {
      return await operation()
    } catch (error) {
      if (isWorkerRunCanceledError(error)) throw error
      const delay = MUTATION_RETRY_DELAYS_MS[attempt]
      if (delay === undefined) {
        throw error instanceof Error ? error : new Error(`Unable to ${label}.`)
      }
      await wait(delay)
      return attemptOperation(attempt + 1)
    }
  }

  return attemptOperation(0)
}

function createLogBuffer(
  client: ReturnType<typeof workerConvexClient>,
  runId: WorkerRunPayload["runId"],
  onSandboxId: (sandboxId: string) => void
) {
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let flushPromise: Promise<void> | undefined
  let flushError: unknown
  const pending: Array<RunCodexLog & { time: number }> = []

  const clearFlushTimer = () => {
    if (!flushTimer) return
    clearTimeout(flushTimer)
    flushTimer = undefined
  }

  const flush = () => {
    if (flushPromise) return flushPromise
    clearFlushTimer()
    const logs = pending.splice(0, LOG_BATCH_SIZE)
    if (logs.length === 0) return Promise.resolve()

    flushPromise = withMutationRetries("append run logs", () =>
      appendWorkerRunLogs(client, runId, logs)
    )
      .then(() => {
        flushError = undefined
      })
      .catch((error) => {
        flushError = error
        if (isWorkerRunCanceledError(error)) throw error
        pending.unshift(...logs)
        console.warn("Unable to append Codex run logs.", error)
        scheduleFlush()
      })
      .finally(() => {
        flushPromise = undefined
        if (pending.length > 0 && !flushError) {
          void flush().catch((error) => {
            flushError = error
          })
        }
      })

    return flushPromise
  }

  const scheduleFlush = () => {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = undefined
      void flush()
    }, LOG_FLUSH_DELAY_MS)
  }

  return {
    emit(log: RunCodexLog) {
      if (isWorkerRunCanceledError(flushError)) throw flushError
      const sandboxId = sandboxIdFromLog(log)
      if (sandboxId) onSandboxId(sandboxId)
      if (!shouldPersistRunLog(log)) return

      pending.push({ ...log, time: Date.now() })
      if (sandboxId) {
        void flush().catch((error) => {
          flushError = error
        })
      } else if (pending.length >= LOG_BATCH_SIZE) {
        void flush().catch((error) => {
          flushError = error
        })
      } else scheduleFlush()
    },
    async flush() {
      clearFlushTimer()
      const deadline = Date.now() + FINAL_FLUSH_TIMEOUT_MS

      const flushUntilDone = async (): Promise<void> => {
        if (isWorkerRunCanceledError(flushError)) throw flushError
        if ((pending.length === 0 && !flushPromise) || Date.now() >= deadline) {
          return
        }
        if (pending.length > 0) {
          void flush().catch((error) => {
            flushError = error
          })
        }
        await (flushPromise ?? Promise.resolve())
        return flushUntilDone()
      }

      if (pending.length === 0 && !flushPromise) {
        if (flushError) {
          throw flushError instanceof Error
            ? flushError
            : new Error("Unable to flush Codex run logs.")
        }
        return
      }

      return flushUntilDone().then(() => {
        if (pending.length > 0 || flushError) {
          throw flushError instanceof Error
            ? flushError
            : new Error("Unable to flush Codex run logs.")
        }
      })
    },
  }
}

function createContentBuffer(
  client: ReturnType<typeof workerConvexClient>,
  runId: WorkerRunPayload["runId"]
) {
  let content = ""
  let flushedContent = ""
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let flushPromise: Promise<void> | undefined
  let flushError: unknown

  const clearFlushTimer = () => {
    if (!flushTimer) return
    clearTimeout(flushTimer)
    flushTimer = undefined
  }

  const flush = () => {
    if (flushPromise) return flushPromise
    clearFlushTimer()
    if (content === flushedContent) return Promise.resolve()
    const snapshot = content

    flushPromise = withMutationRetries("update run content", () =>
      updateWorkerRunContent(client, runId, snapshot)
    )
      .then(() => {
        flushedContent = snapshot
        flushError = undefined
      })
      .catch((error) => {
        flushError = error
        if (isWorkerRunCanceledError(error)) return
        console.warn("Unable to update Codex run content.", error)
        scheduleFlush(500)
      })
      .finally(() => {
        flushPromise = undefined
        if (content !== flushedContent && !flushError) {
          scheduleFlush(0)
        }
      })

    return flushPromise
  }

  const scheduleFlush = (delay = CONTENT_FLUSH_DELAY_MS) => {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = undefined
      void flush().catch((error) => {
        flushError = error
      })
    }, delay)
  }

  const appendRaw = (value: string, options: { immediate?: boolean } = {}) => {
    if (isWorkerRunCanceledError(flushError)) throw flushError
    if (!value) return
    content += value
    if (
      options.immediate ||
      content.length - flushedContent.length >= CONTENT_FLUSH_CHAR_THRESHOLD
    ) {
      void flush().catch((error) => {
        flushError = error
      })
    } else {
      scheduleFlush()
    }
  }

  return {
    append(delta: string) {
      appendRaw(delta)
    },
    appendToolLog(log: RunCodexLog) {
      appendRaw(inlineToolMarker(log) ?? "", { immediate: true })
    },
    get content() {
      return content
    },
    async flush() {
      clearFlushTimer()
      const deadline = Date.now() + FINAL_FLUSH_TIMEOUT_MS

      const flushUntilDone = async (): Promise<void> => {
        if (isWorkerRunCanceledError(flushError)) throw flushError
        if (
          (content === flushedContent && !flushPromise) ||
          Date.now() >= deadline
        ) {
          return
        }
        if (content !== flushedContent) {
          await flush()
        } else {
          await (flushPromise ?? Promise.resolve())
        }
        return flushUntilDone()
      }

      if (content === flushedContent && !flushPromise) {
        if (flushError) {
          throw flushError instanceof Error
            ? flushError
            : new Error("Unable to flush Codex run content.")
        }
        return
      }

      return flushUntilDone().then(() => {
        if (content !== flushedContent || flushError) {
          throw flushError instanceof Error
            ? flushError
            : new Error("Unable to flush Codex run content.")
        }
      })
    },
  }
}

function createTriggerUsageMeter({
  client,
  failBilling,
  onExhausted,
  triggerRunId,
  userId,
}: {
  client: ReturnType<typeof workerConvexClient>
  failBilling: (error: unknown) => void
  onExhausted: () => Promise<void>
  triggerRunId: string
  userId: Id<"users">
}) {
  let checkpoint = 0
  let stopped = false
  let trackedMicroUsd = 0
  let flushPromise: Promise<void> | undefined

  const flush = (reason: string) => {
    if (flushPromise) return flushPromise

    flushPromise = (async () => {
      const current = usage.getCurrent()
      const totalMicroUsd = microUsdFromTriggerCents(current.totalCostInCents)
      const amountMicroUsd = totalMicroUsd - trackedMicroUsd
      if (amountMicroUsd <= 0) return

      const nextCheckpoint = checkpoint + 1
      const result = await recordWorkerBillingUsage(client, {
        amountMicroUsd,
        idempotencyKey: `trigger:${triggerRunId}:${nextCheckpoint}`,
        metadata: {
          baseCostInCents: current.baseCostInCents,
          computeCostInCents: current.compute.total.costInCents,
          durationMs: current.compute.total.durationMs,
          reason,
          totalCostInCents: current.totalCostInCents,
        },
        resourceId: triggerRunId,
        source: "trigger",
        userId,
      })

      if (result.tracked) {
        checkpoint = nextCheckpoint
        trackedMicroUsd = totalMicroUsd
      }
      if (result.exhausted) await onExhausted()
    })()
      .catch((error) => {
        failBilling(error)
        throw error
      })
      .finally(() => {
        flushPromise = undefined
      })

    return flushPromise
  }

  const timer = setInterval(() => {
    if (stopped) return
    void flush("periodic").catch(() => undefined)
  }, BILLING_TRIGGER_CHECKPOINT_MS)
  timer.unref?.()

  return {
    flush,
    stop: () => {
      stopped = true
      clearInterval(timer)
    },
  }
}

async function observeSandboxBilling({
  client,
  sandboxId,
  source,
  userId,
}: {
  client: ReturnType<typeof workerConvexClient>
  sandboxId: string
  source: "observed" | "webhook"
  userId: Id<"users">
}) {
  const sandbox = await getDaytonaSandbox(sandboxId)
  await sandbox.refreshData().catch(() => undefined)
  return await observeWorkerDaytonaSandbox(client, {
    observedAt: Date.now(),
    resources: daytonaSandboxBillingResources(sandbox),
    sandboxId,
    source,
    state: daytonaBillingState(sandbox.state),
    userId,
  })
}

async function pauseSandboxForBilling({
  client,
  sandboxId,
  userId,
}: {
  client: ReturnType<typeof workerConvexClient>
  sandboxId: string
  userId: Id<"users">
}) {
  const sandbox = await getDaytonaSandbox(sandboxId)
  await sandbox.refreshData().catch(() => undefined)
  if (daytonaBillingState(sandbox.state) !== "running") {
    return { paused: false }
  }

  const info = await stopDaytonaSandbox(sandboxId)
  await observeWorkerDaytonaSandbox(client, {
    observedAt: Date.now(),
    resources: {
      cpu: info.cpu,
      diskGiB: info.diskGiB,
      memoryGiB: info.memoryGiB,
    },
    sandboxId,
    source: "observed",
    state: info.billingState,
    userId,
  })
  return { paused: true }
}

type ActiveBillingSandboxSegment = {
  cpu: number
  diskGiB: number
  memoryGiB: number
  sandboxId: string
  userId: Id<"users">
}

export const billingReconcileDaytonaSandboxes = schedules.task({
  id: "billing-reconcile-daytona-sandboxes",
  cron: "*/1 * * * *",
  retry: {
    maxAttempts: 1,
  },
  run: async () => {
    const client = workerConvexClient()
    const activeSegments = (await client.query(
      api.billing.activeDaytonaSegmentsForWorker,
      {
        limit: 200,
        workerSecret: getWorkerSecret(),
      }
    )) as ActiveBillingSandboxSegment[]
    const latestBySandbox = new Map<string, ActiveBillingSandboxSegment>()

    for (const segment of activeSegments) {
      latestBySandbox.set(segment.sandboxId, segment)
    }

    let observed = 0
    let paused = 0
    for (const segment of latestBySandbox.values()) {
      let state: DaytonaBillingState = "deleted"
      let resources = {
        cpu: segment.cpu,
        diskGiB: segment.diskGiB,
        memoryGiB: segment.memoryGiB,
      }

      try {
        const sandbox = await getDaytonaSandbox(segment.sandboxId)
        await sandbox.refreshData().catch(() => undefined)
        state = daytonaBillingState(sandbox.state)
        resources = daytonaSandboxBillingResources(sandbox)
      } catch {
        state = "deleted"
      }

      const result = await observeWorkerDaytonaSandbox(client, {
        observedAt: Date.now(),
        resources,
        sandboxId: segment.sandboxId,
        source: "observed",
        state,
        userId: segment.userId,
      })
      if (result.exhausted) {
        const pause = await pauseSandboxForBilling({
          client,
          sandboxId: segment.sandboxId,
          userId: segment.userId,
        }).catch((error) => {
          console.warn("Unable to pause exhausted billing sandbox.", error)
          return { paused: false }
        })
        if (pause.paused) paused += 1
      }
      observed += 1
    }

    await client.action(api.billing.retryFailedUsageForWorker, {
      limit: 50,
      workerSecret: getWorkerSecret(),
    })

    return { observed, paused }
  },
})

export const cloudcodeRun = task({
  id: "cloudcode-run",
  retry: {
    maxAttempts: 1,
  },
  maxDuration: timeout.None,
  run: async (payload: WorkerRunPayload, { ctx, signal }) => {
    const client = workerConvexClient()
    const billingAbort = createBillingAbortController(signal)
    let billingError: unknown
    let latestSandboxId: string | undefined
    let loadedUserId: Id<"users"> | undefined
    let usageMeter: ReturnType<typeof createTriggerUsageMeter> | undefined
    let billingPauseSandboxId: string | undefined
    let billingPausePromise: Promise<void> | undefined
    const sandboxObservations = new Map<string, Promise<void>>()
    const failBilling = (error: unknown) => {
      billingError = billingError ?? error
      billingAbort.abort(error)
    }
    const throwIfBillingFailed = () => {
      if (billingError) {
        throw billingError instanceof Error
          ? billingError
          : new Error("Billing failed.")
      }
    }
    const pauseLatestSandboxForBilling = (sandboxId = latestSandboxId) => {
      if (!sandboxId || !loadedUserId) return Promise.resolve()
      if (billingPausePromise && billingPauseSandboxId === sandboxId) {
        return billingPausePromise
      }
      billingPauseSandboxId = sandboxId
      billingPausePromise = pauseSandboxForBilling({
        client,
        sandboxId,
        userId: loadedUserId,
      })
        .then(() => undefined)
        .finally(() => {
          billingPausePromise = undefined
        })
      return billingPausePromise
    }
    const handleBillingExhausted = async (sandboxId = latestSandboxId) => {
      await pauseLatestSandboxForBilling(sandboxId)
      throw new Error(
        "Infrastructure usage is exhausted. The Daytona sandbox was paused."
      )
    }
    const observeSandbox = (sandboxId: string) => {
      if (!loadedUserId || sandboxObservations.has(sandboxId)) return
      const observation = observeSandboxBilling({
        client,
        sandboxId,
        source: "observed",
        userId: loadedUserId,
      })
        .then(async (result) => {
          if (result.exhausted) await handleBillingExhausted(sandboxId)
        })
        .catch((error) => {
          failBilling(error)
          throw error
        })
      sandboxObservations.set(sandboxId, observation)
    }
    const logBuffer = createLogBuffer(client, payload.runId, (sandboxId) => {
      latestSandboxId = sandboxId
      observeSandbox(sandboxId)
    })
    const contentBuffer = createContentBuffer(client, payload.runId)

    try {
      const loaded = await startAndLoadWorkerRun(
        client,
        payload.runId,
        ctx.run.id
      )
      if (!loaded) return { canceled: true }

      loadedUserId = loaded.userId
      usageMeter = createTriggerUsageMeter({
        client,
        failBilling,
        onExhausted: () => handleBillingExhausted(),
        triggerRunId: ctx.run.id,
        userId: loaded.userId,
      })
      await usageMeter.flush("started")

      let runInput = loaded.input
      let runAuthJson = loaded.authJson
      latestSandboxId = runInput.sandboxId
      if (latestSandboxId) observeSandbox(latestSandboxId)

      if (runInput.sandboxPreset?.mode === "auto") {
        const currentSandboxId = runInput.sandboxId
        const autoEnvironment = await ensureAutoEnvironmentSandbox({
          authJson: runAuthJson,
          baseBranch: runInput.baseBranch,
          currentSandboxId,
          githubToken: runInput.githubToken,
          githubUserEmail: runInput.githubUserEmail,
          githubUserName: runInput.githubUserName,
          githubUsername: runInput.githubUsername,
          onLog: (log) => {
            contentBuffer.appendToolLog(log)
            logBuffer.emit(log)
          },
          repoUrl: runInput.repoUrl,
          sandboxPreset: runInput.sandboxPreset,
          signal: billingAbort.signal,
          workerSecret: getWorkerSecret(),
        })

        throwIfBillingFailed()
        runAuthJson = autoEnvironment.updatedAuthJson ?? runAuthJson
        runInput = {
          ...runInput,
          authJson: runAuthJson,
          sandboxId: autoEnvironment.sandboxId,
          sandboxPreset: {
            ...runInput.sandboxPreset,
            ...autoEnvironment.preset,
          },
        }
        latestSandboxId = runInput.sandboxId
        if (latestSandboxId) observeSandbox(latestSandboxId)
      }

      const result = await runCodexInSandbox({
        ...runInput,
        authJson: runAuthJson,
        onContentDelta: (delta) => contentBuffer.append(delta),
        onLog: (log) => {
          contentBuffer.appendToolLog(log)
          logBuffer.emit(log)
        },
        onMcpServerToolsDiscovered: async (servers) => {
          await syncWorkerMcpServerTools(client, payload.runId, servers)
        },
        signal: billingAbort.signal,
      })
      latestSandboxId = result.sandboxId
      observeSandbox(result.sandboxId)
      await Promise.allSettled(sandboxObservations.values())
      throwIfBillingFailed()
      await usageMeter.flush("completed")

      await Promise.all([logBuffer.flush(), contentBuffer.flush()])

      if (result.updatedAuthJson !== runAuthJson) {
        await saveWorkerAuthJson(
          loaded.userId,
          loaded.profile,
          result.updatedAuthJson
        )
      }

      const content = workerRunFinalContent(contentBuffer.content, result)
      await completeWorkerRun(client, payload.runId, content, result)

      return {
        canceled: false,
        exitCode: result.exitCode,
        sandboxId: result.sandboxId,
      }
    } catch (error) {
      await Promise.allSettled([logBuffer.flush(), contentBuffer.flush()])
      usageMeter?.stop()
      await usageMeter?.flush("finished-with-error").catch(() => undefined)
      if (latestSandboxId && loadedUserId) {
        await observeSandboxBilling({
          client,
          sandboxId: latestSandboxId,
          source: "observed",
          userId: loadedUserId,
        }).catch(() => undefined)
      }

      if (signal.aborted || isWorkerRunCanceledError(error)) {
        await cancelWorkerRun(client, payload.runId, latestSandboxId)
        return { canceled: true }
      }

      await failWorkerRun(
        client,
        payload.runId,
        errorMessage(error),
        latestSandboxId
      ).catch((failError) => {
        console.warn("Unable to mark Codex run failed.", failError)
      })
      throw error
    } finally {
      usageMeter?.stop()
      billingAbort.cleanup()
    }
  },
  onCancel: async ({ payload }) => {
    await cancelWorkerRun(workerConvexClient(), payload.runId)
  },
})
