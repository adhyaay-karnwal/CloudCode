/**
 * Thrown when a Convex worker mutation reports the run was canceled (status
 * "canceling"/"canceled"). It can surface anywhere a log or content callback
 * runs, so layers that wrap errors must rethrow it unchanged — the Trigger
 * worker uses it to finalize the run as canceled instead of failed.
 */
export class WorkerRunCanceledError extends Error {
  constructor() {
    super("Codex run was canceled.")
    this.name = "WorkerRunCanceledError"
  }
}

export function isWorkerRunCanceledError(
  error: unknown
): error is WorkerRunCanceledError {
  return error instanceof WorkerRunCanceledError
}
