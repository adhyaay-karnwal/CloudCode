"use client"

import { cn } from "@/lib/utils"

export type ContextMenuItem = {
  label: string
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        className="fixed inset-0 z-40 cursor-default border-0 bg-transparent p-0"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        role="menu"
        tabIndex={-1}
        style={{ top: y, left: x }}
        className="fixed z-50 min-w-44 overflow-hidden rounded-2xl border border-black/[0.06] bg-popover p-1.5 text-popover-foreground shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)] dark:border-white/10"
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect()
              onClose()
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40",
              item.destructive &&
                "text-destructive hover:bg-destructive/10 hover:text-destructive"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}
