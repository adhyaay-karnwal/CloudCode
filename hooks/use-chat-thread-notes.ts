"use client"

import { useCallback } from "react"

import type { Id } from "@/convex/_generated/dataModel"

type SetThreadNotes = (args: {
  notes: string
  threadId: Id<"threads">
}) => Promise<unknown>

export function useChatThreadNotes({
  activeId,
  setThreadNotes,
}: {
  activeId: Id<"threads"> | null
  setThreadNotes: SetThreadNotes
}) {
  return useCallback(
    (value: string) => {
      if (!activeId) return
      void setThreadNotes({ notes: value, threadId: activeId }).catch((error) =>
        console.warn("Unable to save notes.", error)
      )
    },
    [activeId, setThreadNotes]
  )
}
