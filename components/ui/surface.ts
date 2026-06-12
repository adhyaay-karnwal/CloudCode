/**
 * Shared surface treatments for floating controls and inline content panels.
 */

/** Floating surface: menus, dropdowns, popovers, dialogs. Flat; hairline border defines the edge. */
export const popoverSurfaceClass =
  "rounded-2xl border border-black/10 bg-popover text-popover-foreground dark:border-white/10"

/** Inline content card: same hairline border + rounding, no elevation. */
export const cardSurfaceClass =
  "rounded-2xl border border-black/10 bg-background dark:border-white/10"
