import { jsonError } from "@/lib/http/api-route"

import {
  isDaytonaNotFoundError,
  isDaytonaOperationTimeoutError,
} from "@/lib/daytona/sandbox"

export function daytonaApiErrorResponse(
  error: unknown,
  fallbackMessage: string
) {
  if (isDaytonaNotFoundError(error)) {
    return jsonError(
      error instanceof Error ? error.message : "Sandbox not found.",
      404,
      { notFound: true }
    )
  }

  if (isDaytonaOperationTimeoutError(error)) {
    return jsonError(error.message, 504, { retryable: true })
  }

  return jsonError(
    error instanceof Error ? error.message : fallbackMessage,
    502
  )
}
