"use client"

import { useEffect } from "react"

import {
  fieldHint,
  fieldLabel,
  textareaClass,
} from "@/components/settings/shared"
import { popoverSurfaceClass } from "@/components/ui/surface"
import { cn } from "@/lib/shared/utils"

export function ChatGPTImportDialog({
  value,
  busy,
  error,
  onValueChange,
  onConfirm,
  onCancel,
}: {
  value: string
  busy: boolean
  error: string
  onValueChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onCancel()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onCancel])

  const canConfirm = !busy && value.trim().length > 0

  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-0 flex h-dvh max-h-none w-screen max-w-none items-center justify-center border-0 bg-black/40 p-4 backdrop-blur-sm"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      aria-modal="true"
      aria-label="Import auth.json"
      tabIndex={-1}
    >
      <button
        type="button"
        aria-label="Cancel dialog"
        tabIndex={-1}
        className="absolute inset-0 cursor-default border-0 bg-transparent p-0"
        onClick={onCancel}
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-md overflow-hidden p-5",
          popoverSurfaceClass
        )}
      >
        <div className="text-base font-medium text-foreground">
          Import auth.json
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          You can find it in{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-[family-name:var(--font-mono)] text-[12px]">
            ~/.codex/auth.json
          </code>
          . If you have not logged in yet, run{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-[family-name:var(--font-mono)] text-[12px]">
            codex login
          </code>{" "}
          first. Then paste its contents here.
        </p>
        <label className={cn(fieldLabel, "mt-4")}>
          <textarea
            autoFocus
            aria-label="auth.json contents"
            rows={8}
            spellCheck={false}
            value={value}
            disabled={busy}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder='{"auth_mode":"chatgpt","tokens":{ ... }}'
            className={textareaClass}
          />
          <span className={fieldHint}>
            Pasted credentials are saved to your account, same as connecting
            with ChatGPT.
          </span>
        </label>
        {error ? (
          <div className="mt-2 text-[11px] leading-4 text-destructive">
            {error}
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-border px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="rounded-lg bg-foreground px-3 py-2 text-sm text-background transition-colors hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </dialog>
  )
}
