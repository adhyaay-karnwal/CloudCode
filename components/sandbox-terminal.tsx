"use client"

import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import {
  CircleDot,
  Loader2,
  OctagonX,
  Plus,
  RefreshCw,
  SquareTerminal,
  X,
} from "lucide-react"
import { useTheme } from "next-themes"
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react"

import { ContextMenu } from "@/components/context-menu"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import {
  killBrowserTerminalSession,
  registerTerminalCloser,
} from "@/components/sandbox-terminal-session"
import { cn } from "@/lib/utils"

type TerminalStatus = "connecting" | "ready" | "reconnecting" | "error"

type TerminalPalette = {
  background: string
  black: string
  blue: string
  brightBlack: string
  brightBlue: string
  brightCyan: string
  brightGreen: string
  brightMagenta: string
  brightRed: string
  brightWhite: string
  brightYellow: string
  cursor: string
  cursorAccent: string
  cyan: string
  foreground: string
  green: string
  magenta: string
  red: string
  selectionBackground: string
  selectionForeground: string
  white: string
  yellow: string
}

type TerminalWindow = {
  id: string
  label: string
  restartKey: number
}

type TerminalDockState = {
  activeBySandbox: Record<string, string>
  sessionsBySandbox: Record<string, TerminalWindow[]>
}

type TerminalDockAction =
  | {
      type: "connect-sandbox"
      createTerminal: (sandboxId: string) => TerminalWindow
      sandboxId: string
    }
  | { type: "add"; sandboxId: string; terminal: TerminalWindow }
  | { type: "close"; sandboxId: string; terminalId: string }
  | { type: "rename"; label: string; sandboxId: string; terminalId: string }
  | { type: "restart"; sandboxId: string; terminalId: string }
  | { type: "select"; sandboxId: string; terminalId: string }

type MountedTerminalState = Record<string, Record<string, true>>

type TerminalSessionState = {
  error: string | null
  status: TerminalStatus
}

const TERMINAL_DOCK_KEY = "cloudcode:terminalDock:v1"
const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/
const TERMINAL_INPUT_FLUSH_DELAY_MS = 10

const darkPalette: TerminalPalette = {
  background: "#0b0d10",
  black: "#15181d",
  blue: "#7aa2f7",
  brightBlack: "#5b6172",
  brightBlue: "#9ab8ff",
  brightCyan: "#7dd3fc",
  brightGreen: "#9ee6a3",
  brightMagenta: "#d8b4fe",
  brightRed: "#ffa39e",
  brightWhite: "#ffffff",
  brightYellow: "#fbd38d",
  cursor: "#e6e8eb",
  cursorAccent: "#0b0d10",
  cyan: "#67e8f9",
  foreground: "#e6e8eb",
  green: "#73d13d",
  magenta: "#c084fc",
  red: "#ff7373",
  selectionBackground: "rgba(122, 162, 247, 0.28)",
  selectionForeground: "#ffffff",
  white: "#d7d7d7",
  yellow: "#f4bf75",
}

const lightPalette: TerminalPalette = {
  background: "#fbfbfa",
  black: "#1f2328",
  blue: "#0969da",
  brightBlack: "#6e7781",
  brightBlue: "#218bff",
  brightCyan: "#179299",
  brightGreen: "#1a7f37",
  brightMagenta: "#a475f9",
  brightRed: "#cf222e",
  brightWhite: "#1f2328",
  brightYellow: "#9a6700",
  cursor: "#1f2328",
  cursorAccent: "#fbfbfa",
  cyan: "#0e7490",
  foreground: "#1f2328",
  green: "#1f883d",
  magenta: "#8250df",
  red: "#d1242f",
  selectionBackground: "rgba(9, 105, 218, 0.18)",
  selectionForeground: "#1f2328",
  white: "#57606a",
  yellow: "#bf8700",
}

function createTerminalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `cloudcode-${crypto.randomUUID()}`
  }
  return `cloudcode-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`
}

function terminalStatusLabel(state: TerminalSessionState | undefined) {
  if (!state) return "Starting"
  if (state.status === "ready") return "Connected"
  if (state.status === "reconnecting") return "Reconnecting"
  if (state.status === "error") return state.error ?? "Connection issue"
  return "Connecting"
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function loadPersistedTerminalDock(): TerminalDockState {
  if (typeof window === "undefined") {
    return { activeBySandbox: {}, sessionsBySandbox: {} }
  }

  try {
    const raw = localStorage.getItem(TERMINAL_DOCK_KEY)
    if (!raw) return { activeBySandbox: {}, sessionsBySandbox: {} }

    const parsed = JSON.parse(raw) as unknown
    if (!isPlainRecord(parsed)) {
      return { activeBySandbox: {}, sessionsBySandbox: {} }
    }

    const persistedSessions = isPlainRecord(parsed.sessionsBySandbox)
      ? parsed.sessionsBySandbox
      : {}
    const persistedActive = isPlainRecord(parsed.activeBySandbox)
      ? parsed.activeBySandbox
      : {}
    const sessionsBySandbox: Record<string, TerminalWindow[]> = {}
    const activeBySandbox: Record<string, string> = {}

    for (const [sandboxId, value] of Object.entries(persistedSessions)) {
      if (!sandboxId || !Array.isArray(value)) continue
      const seen = new Set<string>()
      const sessions: TerminalWindow[] = []

      for (const item of value) {
        if (!isPlainRecord(item)) continue
        const id = typeof item.id === "string" ? item.id : ""
        if (!TERMINAL_ID_PATTERN.test(id) || seen.has(id)) continue

        seen.add(id)
        sessions.push({
          id,
          label:
            typeof item.label === "string" && item.label.trim()
              ? item.label.trim()
              : `Terminal ${sessions.length + 1}`,
          restartKey: 0,
        })
      }

      if (sessions.length === 0) continue
      sessionsBySandbox[sandboxId] = sessions

      const activeId = persistedActive[sandboxId]
      activeBySandbox[sandboxId] =
        typeof activeId === "string" &&
        sessions.some((session) => session.id === activeId)
          ? activeId
          : sessions[0].id
    }

    return { activeBySandbox, sessionsBySandbox }
  } catch {
    return { activeBySandbox: {}, sessionsBySandbox: {} }
  }
}

function persistTerminalDock(dock: TerminalDockState) {
  if (typeof window === "undefined") return

  try {
    const sessionsBySandbox: Record<
      string,
      Array<{ id: string; label: string }>
    > = {}
    for (const [sandboxId, sessions] of Object.entries(
      dock.sessionsBySandbox
    )) {
      if (sessions.length === 0) continue
      sessionsBySandbox[sandboxId] = sessions.map(({ id, label }) => ({
        id,
        label,
      }))
    }

    if (Object.keys(sessionsBySandbox).length === 0) {
      localStorage.removeItem(TERMINAL_DOCK_KEY)
      return
    }

    localStorage.setItem(
      TERMINAL_DOCK_KEY,
      JSON.stringify({
        activeBySandbox: dock.activeBySandbox,
        sessionsBySandbox,
      })
    )
  } catch {
    // Losing persisted dock metadata should not interrupt live terminal input.
  }
}

function terminalDockReducer(
  state: TerminalDockState,
  action: TerminalDockAction
): TerminalDockState {
  switch (action.type) {
    case "add":
      return {
        activeBySandbox: {
          ...state.activeBySandbox,
          [action.sandboxId]: action.terminal.id,
        },
        sessionsBySandbox: {
          ...state.sessionsBySandbox,
          [action.sandboxId]: [
            ...(state.sessionsBySandbox[action.sandboxId] ?? []),
            action.terminal,
          ],
        },
      }
    case "close": {
      const currentSessions = state.sessionsBySandbox[action.sandboxId] ?? []
      const removedIndex = currentSessions.findIndex(
        (session) => session.id === action.terminalId
      )
      const nextSessions = currentSessions.filter(
        (session) => session.id !== action.terminalId
      )
      const nextActiveId =
        state.activeBySandbox[action.sandboxId] === action.terminalId
          ? (nextSessions[Math.max(0, removedIndex - 1)] ?? nextSessions[0])?.id
          : state.activeBySandbox[action.sandboxId]

      return {
        activeBySandbox: {
          ...state.activeBySandbox,
          ...(nextActiveId ? { [action.sandboxId]: nextActiveId } : {}),
        },
        sessionsBySandbox: {
          ...state.sessionsBySandbox,
          [action.sandboxId]: nextSessions,
        },
      }
    }
    case "connect-sandbox": {
      const sessions = state.sessionsBySandbox[action.sandboxId] ?? []
      if (sessions.length > 0) {
        const activeId = state.activeBySandbox[action.sandboxId]
        if (activeId && sessions.some((session) => session.id === activeId)) {
          return state
        }

        return {
          activeBySandbox: {
            ...state.activeBySandbox,
            [action.sandboxId]: sessions[0].id,
          },
          sessionsBySandbox: state.sessionsBySandbox,
        }
      }

      const terminal = action.createTerminal(action.sandboxId)
      return {
        activeBySandbox: {
          ...state.activeBySandbox,
          [action.sandboxId]: terminal.id,
        },
        sessionsBySandbox: {
          ...state.sessionsBySandbox,
          [action.sandboxId]: [terminal],
        },
      }
    }
    case "rename": {
      const currentSessions = state.sessionsBySandbox[action.sandboxId] ?? []
      if (
        !currentSessions.some(
          (session) =>
            session.id === action.terminalId && session.label !== action.label
        )
      ) {
        return state
      }

      return {
        activeBySandbox: state.activeBySandbox,
        sessionsBySandbox: {
          ...state.sessionsBySandbox,
          [action.sandboxId]: currentSessions.map((session) =>
            session.id === action.terminalId
              ? { ...session, label: action.label }
              : session
          ),
        },
      }
    }
    case "restart": {
      const currentSessions = state.sessionsBySandbox[action.sandboxId] ?? []
      return {
        activeBySandbox: state.activeBySandbox,
        sessionsBySandbox: {
          ...state.sessionsBySandbox,
          [action.sandboxId]: currentSessions.map((session) =>
            session.id === action.terminalId
              ? { ...session, restartKey: session.restartKey + 1 }
              : session
          ),
        },
      }
    }
    case "select":
      return {
        activeBySandbox: {
          ...state.activeBySandbox,
          [action.sandboxId]: action.terminalId,
        },
        sessionsBySandbox: state.sessionsBySandbox,
      }
  }
}

function terminalNumbersFromDock(dock: TerminalDockState) {
  const numbers: Record<string, number> = {}

  for (const [sandboxId, sessions] of Object.entries(dock.sessionsBySandbox)) {
    numbers[sandboxId] = sessions.reduce((max, session, index) => {
      const match = /^Terminal (\d+)$/.exec(session.label)
      const labelNumber = match ? Number(match[1]) : index + 1
      return Number.isFinite(labelNumber) ? Math.max(max, labelNumber) : max
    }, 0)
  }

  return numbers
}

function isEditableElement(element: Element | null) {
  if (!element) return false
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return true
  }

  return (
    element instanceof HTMLElement &&
    (element.isContentEditable || element.getAttribute("role") === "textbox")
  )
}

export function SandboxTerminalPanel({
  open,
  sandboxId,
  onClose,
  height,
  onHeightChange,
}: {
  open: boolean
  sandboxId: string | null
  onClose: () => void
  height: number
  onHeightChange: (height: number) => void
}) {
  const [dock, dispatchDock] = useReducer(
    terminalDockReducer,
    undefined,
    loadPersistedTerminalDock
  )
  const [sessionStates, setSessionStates] = useState<
    Record<string, TerminalSessionState>
  >({})
  const mountedBySandboxRef = useRef<MountedTerminalState>({})
  const [renaming, setRenaming] = useState<{
    draft: string
    terminalId: string
  } | null>(null)
  const [menu, setMenu] = useState<{
    terminalId: string
    x: number
    y: number
  } | null>(null)
  const dragStartRef = useRef<{ h: number; y: number } | null>(null)
  const nextTerminalNumberRef = useRef<Record<string, number> | null>(null)
  if (nextTerminalNumberRef.current === null) {
    nextTerminalNumberRef.current = terminalNumbersFromDock(dock)
  }

  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== "light"
  const palette = isDark ? darkPalette : lightPalette
  const lastConnectedSandboxIdRef = useRef<string | null>(null)
  if (open && sandboxId) lastConnectedSandboxIdRef.current = sandboxId
  else if (!sandboxId) lastConnectedSandboxIdRef.current = null
  const connectedSandboxId =
    sandboxId && (open || lastConnectedSandboxIdRef.current === sandboxId)
      ? sandboxId
      : null

  const createTerminalWindow = useCallback((targetSandboxId: string) => {
    const nextTerminalNumber = nextTerminalNumberRef.current!
    const nextNumber = (nextTerminalNumber[targetSandboxId] ?? 0) + 1
    nextTerminalNumber[targetSandboxId] = nextNumber

    return {
      id: createTerminalId(),
      label: `Terminal ${nextNumber}`,
      restartKey: 0,
    }
  }, [])

  useEffect(() => {
    persistTerminalDock(dock)
  }, [dock])

  useEffect(() => {
    if (!connectedSandboxId) return

    dispatchDock({
      type: "connect-sandbox",
      createTerminal: createTerminalWindow,
      sandboxId: connectedSandboxId,
    })
  }, [connectedSandboxId, createTerminalWindow])

  const handleSessionStatusChange = useCallback(
    (terminalId: string, nextState: TerminalSessionState) => {
      setSessionStates((current) => {
        const currentState = current[terminalId]
        if (
          currentState?.status === nextState.status &&
          currentState.error === nextState.error
        ) {
          return current
        }
        return { ...current, [terminalId]: nextState }
      })
    },
    []
  )

  const sessions = connectedSandboxId
    ? (dock.sessionsBySandbox[connectedSandboxId] ?? [])
    : []
  const activeSessionId = connectedSandboxId
    ? dock.activeBySandbox[connectedSandboxId]
    : undefined
  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ??
    sessions[0] ??
    null
  const activeState = activeSession
    ? sessionStates[activeSession.id]
    : undefined
  if (connectedSandboxId && activeSession) {
    const currentMounted = mountedBySandboxRef.current[connectedSandboxId]
    if (!currentMounted?.[activeSession.id]) {
      mountedBySandboxRef.current = {
        ...mountedBySandboxRef.current,
        [connectedSandboxId]: {
          ...currentMounted,
          [activeSession.id]: true,
        },
      }
    }
  }
  const mountedSessions = connectedSandboxId
    ? (mountedBySandboxRef.current[connectedSandboxId] ?? {})
    : {}
  const renderSessions = sessions.filter(
    (session) => mountedSessions[session.id] || session.id === activeSession?.id
  )

  function addTerminalWindow() {
    if (!connectedSandboxId) return
    const terminal = createTerminalWindow(connectedSandboxId)
    dispatchDock({ type: "add", sandboxId: connectedSandboxId, terminal })
  }

  function selectTerminalWindow(terminalId: string) {
    if (!connectedSandboxId) return
    dispatchDock({ type: "select", sandboxId: connectedSandboxId, terminalId })
  }

  function renameTerminalWindow(terminalId: string, nextLabel: string) {
    if (!connectedSandboxId) return
    const trimmed = nextLabel.trim()
    if (!trimmed) return
    dispatchDock({
      type: "rename",
      label: trimmed,
      sandboxId: connectedSandboxId,
      terminalId,
    })
  }

  function closeTerminalWindow(terminalId: string) {
    if (!connectedSandboxId || sessions.length <= 1) return
    void killBrowserTerminalSession(connectedSandboxId, terminalId)
    setSessionStates((current) => {
      const next = { ...current }
      delete next[terminalId]
      return next
    })
    const currentMountedSessions =
      mountedBySandboxRef.current[connectedSandboxId]
    if (currentMountedSessions?.[terminalId]) {
      const { [terminalId]: _removed, ...nextSessions } = currentMountedSessions
      void _removed
      mountedBySandboxRef.current = {
        ...mountedBySandboxRef.current,
        [connectedSandboxId]: nextSessions,
      }
    }
    dispatchDock({ type: "close", sandboxId: connectedSandboxId, terminalId })
  }

  function reconnectActiveTerminal() {
    if (!connectedSandboxId || !activeSession) return
    const sandboxId = connectedSandboxId
    const terminalId = activeSession.id
    setSessionStates((current) => ({
      ...current,
      [terminalId]: { error: null, status: "connecting" },
    }))
    void (async () => {
      await killBrowserTerminalSession(sandboxId, terminalId, {
        forget: false,
      })
      dispatchDock({ type: "restart", sandboxId, terminalId })
    })()
  }

  function handleResizeStart(e: ReactMouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    dragStartRef.current = { h: height, y: e.clientY }

    function onMove(ev: MouseEvent) {
      const ctx = dragStartRef.current
      if (!ctx) return
      const next = Math.min(
        Math.max(260, ctx.h + (ctx.y - ev.clientY)),
        Math.max(300, window.innerHeight - 180)
      )
      onHeightChange(next)
    }

    function onUp() {
      dragStartRef.current = null
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      document.body.style.removeProperty("cursor")
      document.body.style.removeProperty("user-select")
    }

    document.body.style.cursor = "row-resize"
    document.body.style.userSelect = "none"
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  if (!open && !connectedSandboxId) return null

  const waitingForSandbox = open && !connectedSandboxId
  const statusLabel = waitingForSandbox
    ? "Waiting"
    : terminalStatusLabel(activeState)
  const statusIsError = !waitingForSandbox && activeState?.status === "error"
  const statusIsReady = !waitingForSandbox && activeState?.status === "ready"

  return (
    <section
      aria-hidden={!open}
      className="absolute inset-x-0 bottom-0 z-20 flex max-h-[85dvh] min-h-0 flex-col overflow-hidden border-t border-border/60 bg-background text-foreground"
      style={{
        height: open ? height : 0,
        visibility: open ? "visible" : "hidden",
        pointerEvents: open ? undefined : "none",
      }}
    >
      <button
        type="button"
        aria-label="Resize terminal"
        onMouseDown={handleResizeStart}
        className="group absolute top-0 right-0 left-0 z-30 h-2 -translate-y-1 cursor-row-resize border-0 bg-transparent p-0"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 right-0 left-0 h-px bg-border/60 transition-colors group-hover:bg-primary/40"
        />
      </button>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/60 px-2">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {sessions.map((session) => (
            <TerminalTab
              key={session.id}
              session={session}
              active={session.id === activeSession?.id}
              editing={renaming?.terminalId === session.id}
              renameDraft={
                renaming?.terminalId === session.id ? renaming.draft : ""
              }
              onSelect={() => selectTerminalWindow(session.id)}
              onStartRename={() => {
                setMenu(null)
                setRenaming({ draft: session.label, terminalId: session.id })
              }}
              onRenameDraftChange={(draft) =>
                setRenaming((current) =>
                  current?.terminalId === session.id
                    ? { ...current, draft }
                    : current
                )
              }
              onCancelRename={() => setRenaming(null)}
              onCommitRename={(label) => {
                renameTerminalWindow(session.id, label)
                setRenaming(null)
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setMenu({
                  terminalId: session.id,
                  x: event.clientX,
                  y: event.clientY,
                })
              }}
            />
          ))}
          <IconButton
            onClick={addTerminalWindow}
            disabled={!connectedSandboxId}
            aria-label="New terminal"
            title="New terminal"
            className="ml-0.5"
          >
            <Plus className="size-3.5" />
          </IconButton>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            aria-live="polite"
            className={cn(
              "pointer-events-none inline-flex max-w-48 items-center gap-1.5 truncate px-1.5 text-xs font-medium",
              statusIsError ? "text-destructive" : "text-muted-foreground"
            )}
            title={
              statusIsError ? (activeState?.error ?? undefined) : undefined
            }
          >
            {statusIsReady ? (
              <CircleDot className="size-3.5 shrink-0 text-success" />
            ) : statusIsError ? (
              <OctagonX className="size-3.5 shrink-0" />
            ) : (
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
            )}
            <span className="truncate">{statusLabel}</span>
          </span>
          <IconButton
            onClick={reconnectActiveTerminal}
            disabled={!activeSession}
            aria-label="Reconnect terminal"
            title="Reconnect terminal"
          >
            <RefreshCw className="size-3.5" />
          </IconButton>
          <IconButton
            onClick={onClose}
            aria-label="Hide terminal dock"
            title="Hide terminal dock"
          >
            <X />
          </IconButton>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-hidden px-3 pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
        style={{ background: palette.background, color: palette.foreground }}
      >
        <div className="relative h-full w-full overflow-hidden">
          {connectedSandboxId && sessions.length > 0 ? (
            renderSessions.map((session) => (
              <SandboxTerminalPane
                key={`${connectedSandboxId}:${session.id}:${session.restartKey}`}
                active={open && session.id === activeSession?.id}
                palette={palette}
                sandboxId={connectedSandboxId}
                session={session}
                onStatusChange={handleSessionStatusChange}
              />
            ))
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Waiting for sandbox</span>
            </div>
          )}
        </div>
      </div>
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Rename",
              onSelect: () => {
                const session = sessions.find(
                  (candidate) => candidate.id === menu.terminalId
                )
                if (session) {
                  setRenaming({ draft: session.label, terminalId: session.id })
                }
              },
            },
            {
              label: "Delete",
              destructive: true,
              disabled: sessions.length <= 1,
              onSelect: () => closeTerminalWindow(menu.terminalId),
            },
          ]}
        />
      ) : null}
    </section>
  )
}

function TerminalTab({
  active,
  editing,
  renameDraft,
  session,
  onSelect,
  onStartRename,
  onRenameDraftChange,
  onCancelRename,
  onCommitRename,
  onContextMenu,
}: {
  active: boolean
  editing: boolean
  renameDraft: string
  session: TerminalWindow
  onSelect: () => void
  onStartRename: () => void
  onRenameDraftChange: (draft: string) => void
  onCancelRename: () => void
  onCommitRename: (label: string) => void
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void
}) {
  const setRenameInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus()
    node?.select()
  }, [])

  const containerClass = cn(
    "flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors",
    active
      ? "bg-muted text-foreground"
      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
  )

  if (editing) {
    return (
      <div onContextMenu={onContextMenu} className={containerClass}>
        <SquareTerminal className="size-3.5 shrink-0" />
        <Input
          ref={setRenameInputRef}
          variant="bare"
          aria-label={`Rename ${session.label}`}
          value={renameDraft}
          onChange={(e) => onRenameDraftChange(e.target.value)}
          onBlur={(e) => onCommitRename(e.currentTarget.value)}
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              onCommitRename(e.currentTarget.value)
            } else if (e.key === "Escape") {
              e.preventDefault()
              onCancelRename()
            }
          }}
          className="w-28 text-xs text-foreground"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onStartRename}
      onContextMenu={onContextMenu}
      aria-label={`Open ${session.label}`}
      aria-pressed={active}
      title={session.label}
      className={cn(
        containerClass,
        "outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      )}
    >
      <SquareTerminal className="size-3.5 shrink-0" />
      <span className="max-w-28 truncate">{session.label}</span>
    </button>
  )
}

function SandboxTerminalPane({
  active,
  palette,
  sandboxId,
  session,
  onStatusChange,
}: {
  active: boolean
  palette: TerminalPalette
  sandboxId: string
  session: TerminalWindow
  onStatusChange: (terminalId: string, state: TerminalSessionState) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const activeRef = useRef(active)
  const paletteRef = useRef<TerminalPalette>(palette)
  const scheduleResizeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    paletteRef.current = palette
    if (terminalRef.current) {
      terminalRef.current.options.theme = palette
    }
  }, [palette])

  useEffect(() => {
    if (!active) return

    const frame = requestAnimationFrame(() => {
      scheduleResizeRef.current?.()
      terminalRef.current?.focus()
    })

    return () => cancelAnimationFrame(frame)
  }, [active])

  useEffect(() => {
    if (!containerRef.current) return

    const sessionSandboxId = sandboxId
    const terminalId = session.id
    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      fontFamily:
        '"JetBrains Mono", "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
      fontSize: 13,
      fontWeight: "400",
      fontWeightBold: "600",
      letterSpacing: 0.2,
      lineHeight: 1.35,
      macOptionIsMeta: true,
      minimumContrastRatio: 4,
      scrollback: 10_000,
      smoothScrollDuration: 0,
      theme: paletteRef.current,
    })
    terminalRef.current = terminal
    const fitAddon = new FitAddon()
    const node = containerRef.current
    let disposed = false
    let connectedOnce = false
    let inputFlushTimer: ReturnType<typeof setTimeout> | undefined
    let reconnectAttempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let pendingInput = ""
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    let socket: WebSocket | undefined
    let socketConnectionId = 0
    let socketInputReady = false
    let lastSize = { cols: 0, rows: 0 }
    const inputEncoder = new TextEncoder()

    function setTerminalState(
      status: TerminalStatus,
      error: string | null = null
    ) {
      onStatusChange(terminalId, { error, status })
    }

    function postTerminalControl(payload: Record<string, unknown>) {
      if (disposed) return Promise.resolve()
      return fetch("/api/sandbox/terminal/ws", {
        body: JSON.stringify({
          sandboxId: sessionSandboxId,
          terminalId,
          ...payload,
        }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }).then(async (res) => {
        if (res.ok) return
        const data = (await res.json().catch(() => undefined)) as
          | { error?: unknown }
          | undefined
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Terminal request failed."
        )
      })
    }

    function flushInput() {
      if (!pendingInput || disposed) return
      if (
        !socketInputReady ||
        !socket ||
        socket.readyState !== WebSocket.OPEN
      ) {
        return
      }

      const data = pendingInput
      pendingInput = ""
      try {
        socket.send(inputEncoder.encode(data))
      } catch (error) {
        pendingInput = data + pendingInput
        setTerminalState(
          "error",
          error instanceof Error ? error.message : "Terminal input failed."
        )
      }
    }

    function sendResize() {
      if (disposed || !activeRef.current) return
      try {
        fitAddon.fit()
      } catch {
        return
      }

      const cols = terminal.cols
      const rows = terminal.rows
      if (!cols || !rows) return
      if (cols === lastSize.cols && rows === lastSize.rows) return
      lastSize = { cols, rows }
      void postTerminalControl({ action: "resize", cols, rows }).catch(() => {
        // The initial resize can race the PTY creation; the WebSocket prep
        // request also carries the first size, so missing this one is harmless.
      })
    }

    function scheduleResize() {
      if (!activeRef.current) return
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(sendResize, 50)
    }
    scheduleResizeRef.current = scheduleResize

    function killTerminal() {
      void killBrowserTerminalSession(sessionSandboxId, terminalId)
    }

    const unregisterCloser = registerTerminalCloser(
      sessionSandboxId,
      terminalId,
      killTerminal
    )

    function queueInput(data: string) {
      pendingInput += data
      if (inputFlushTimer) return
      inputFlushTimer = setTimeout(() => {
        inputFlushTimer = undefined
        flushInput()
      }, TERMINAL_INPUT_FLUSH_DELAY_MS)
    }

    const dataDisposable = terminal.onData(queueInput)

    // xterm.js doesn't translate Option/Cmd + Arrow/Backspace to readline word/line edits.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true
      const { altKey, ctrlKey, metaKey, shiftKey } = event

      if (altKey && !ctrlKey && !metaKey) {
        let seq: string | undefined
        if (event.key === "ArrowLeft") seq = "\x1bb"
        else if (event.key === "ArrowRight") seq = "\x1bf"
        else if (event.key === "Backspace") seq = "\x1b\x7f"
        else if (event.key === "Delete") seq = "\x1bd"
        if (seq) {
          event.preventDefault()
          queueInput(seq)
          return false
        }
      }

      if (metaKey && !ctrlKey && !altKey && !shiftKey) {
        let seq: string | undefined
        if (event.key === "ArrowLeft") seq = "\x01"
        else if (event.key === "ArrowRight") seq = "\x05"
        else if (event.key === "Backspace") seq = "\x15"
        else if (event.key === "Delete") seq = "\x0b"
        if (seq) {
          event.preventDefault()
          queueInput(seq)
          return false
        }
      }

      return true
    })
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(scheduleResize)

    terminal.loadAddon(fitAddon)
    terminal.open(node)
    focusTerminal()
    resizeObserver?.observe(node)
    window.addEventListener("resize", scheduleResize)

    try {
      fitAddon.fit()
      lastSize = { cols: terminal.cols, rows: terminal.rows }
    } catch {
      lastSize = { cols: 100, rows: 30 }
    }

    setTerminalState("connecting")

    function terminalWebSocketParams() {
      return new URLSearchParams({
        cols: String(lastSize.cols || 100),
        rows: String(lastSize.rows || 30),
        sandboxId: sessionSandboxId,
        terminalId,
      })
    }

    async function prepareTerminalWebSocket() {
      const response = await fetch(
        `/api/sandbox/terminal/ws?${terminalWebSocketParams()}`,
        { cache: "no-store" }
      )
      const data = (await response.json().catch(() => undefined)) as
        | { error?: unknown; protocol?: unknown; wsUrl?: unknown }
        | undefined

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Unable to prepare Daytona terminal."
        )
      }

      if (typeof data?.wsUrl !== "string" || !data.wsUrl.trim()) {
        throw new Error("Daytona terminal WebSocket URL missing.")
      }

      return {
        protocol: typeof data.protocol === "string" ? data.protocol : undefined,
        wsUrl: data.wsUrl,
      }
    }

    function scheduleReconnect() {
      if (disposed || reconnectTimer) return
      setTerminalState("reconnecting")
      const delay = Math.min(5_000, 250 * 2 ** reconnectAttempt)
      reconnectAttempt += 1
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined
        void connectSocket()
      }, delay)
    }

    function handleSocketError(error: string) {
      if (disposed) return
      setTerminalState("error", error)
      terminal.writeln(`\r\n${error}`)
    }

    async function socketBytes(data: unknown) {
      if (data instanceof ArrayBuffer) return new Uint8Array(data)
      if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      }
      if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer())
      return null
    }

    async function handleSocketMessage(event: MessageEvent) {
      if (disposed) return

      if (typeof event.data === "string") {
        try {
          const message = JSON.parse(event.data) as {
            error?: unknown
            status?: unknown
            type?: unknown
          }
          if (message.type === "control") {
            if (message.status === "connected") {
              connectedOnce = true
              reconnectAttempt = 0
              socketInputReady = true
              setTerminalState("ready")
              flushInput()
              focusTerminal()
              return
            }
            if (message.status === "error") {
              handleSocketError(
                typeof message.error === "string"
                  ? message.error
                  : "Unable to connect Daytona terminal."
              )
              socket?.close()
              return
            }
          }
        } catch {
          // Non-control strings are PTY output.
        }

        terminal.write(event.data)
        return
      }

      const bytes = await socketBytes(event.data)
      if (bytes?.byteLength) terminal.write(bytes)
    }

    async function connectSocket() {
      const connectionId = socketConnectionId + 1
      socketConnectionId = connectionId
      socketInputReady = false

      try {
        const { protocol, wsUrl } = await prepareTerminalWebSocket()
        if (disposed || connectionId !== socketConnectionId) return

        socket?.close()
        socket = protocol
          ? new WebSocket(wsUrl, protocol)
          : new WebSocket(wsUrl)
        socket.binaryType = "arraybuffer"
        socket.onmessage = (event) => {
          void handleSocketMessage(event)
        }
        socket.onerror = () => {
          if (!disposed) setTerminalState("reconnecting")
        }
        socket.onclose = (event) => {
          if (disposed || connectionId !== socketConnectionId) return
          socketInputReady = false
          socket = undefined

          if (!connectedOnce) {
            handleSocketError(
              event.reason || "Unable to connect Daytona terminal."
            )
            return
          }

          scheduleReconnect()
        }
      } catch (error) {
        if (disposed || connectionId !== socketConnectionId) return

        const detail =
          error instanceof Error
            ? error.message
            : "Unable to connect Daytona terminal."
        if (connectedOnce) {
          setTerminalState("reconnecting")
          scheduleReconnect()
        } else {
          handleSocketError(detail)
        }
      }
    }

    void connectSocket()

    return () => {
      unregisterCloser()
      if (scheduleResizeRef.current === scheduleResize) {
        scheduleResizeRef.current = null
      }
      if (inputFlushTimer) {
        clearTimeout(inputFlushTimer)
        inputFlushTimer = undefined
      }
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (resizeTimer) clearTimeout(resizeTimer)
      flushInput()
      disposed = true
      dataDisposable.dispose()
      resizeObserver?.disconnect()
      window.removeEventListener("resize", scheduleResize)
      socket?.close()
      terminal.dispose()
      if (terminalRef.current === terminal) terminalRef.current = null
    }
    // palette is applied via a separate effect; we intentionally don't recreate
    // the terminal when the theme changes.
  }, [onStatusChange, sandboxId, session.id, session.restartKey])

  function shouldFocusTerminal() {
    if (!activeRef.current) return false

    const activeElement = document.activeElement
    const terminalElement = terminalRef.current?.element
    if (!activeElement || activeElement === document.body) return true
    if (terminalElement?.contains(activeElement)) return true

    return !isEditableElement(activeElement)
  }

  function focusTerminal() {
    requestAnimationFrame(() => {
      if (shouldFocusTerminal()) terminalRef.current?.focus()
    })
  }

  function focusTerminalFromPointer() {
    if (!activeRef.current) return
    terminalRef.current?.focus()
  }

  return (
    <div
      aria-hidden={!active}
      className={cn(
        "absolute inset-0 flex flex-col overflow-hidden transition-opacity",
        active ? "opacity-100" : "pointer-events-none opacity-0"
      )}
      style={{ background: palette.background }}
    >
      <div className="relative min-h-0 w-full flex-1 overflow-hidden">
        <div
          ref={containerRef}
          onPointerDown={focusTerminalFromPointer}
          className="h-full w-full overflow-hidden [&_.xterm]:!bg-transparent [&_.xterm-screen]:outline-none [&_.xterm-viewport]:!bg-transparent"
          style={{ background: palette.background }}
        />
      </div>
    </div>
  )
}
