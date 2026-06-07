"use client"

import {
  ClipboardPaste,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react"
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react"

import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cardSurfaceClass } from "@/components/ui/surface"
import {
  dedupeEnvVars,
  ENV_NAME_PATTERN,
  parseDotenv,
} from "@/lib/dotenv-parse"
import { cn } from "@/lib/utils"

type EnvVar = { name: string; value: string }
type LocalRow = EnvVar & { id: string }
type Status = "error" | "idle" | "loading" | "saved" | "saving"

type EnvironmentPanelState = {
  adding: boolean
  draftName: string
  draftValue: string
  error: string | null
  original: EnvVar[]
  pasteText: string
  pasting: boolean
  revealed: Set<string>
  rows: LocalRow[]
  status: Status
}

type EnvironmentPanelAction =
  | { type: "apply-entries"; entries: EnvVar[]; status?: Status }
  | { type: "cancel-draft" }
  | { type: "cancel-pasting" }
  | { type: "draft-name"; value: string }
  | { type: "draft-value"; value: string }
  | { type: "import-pasted"; vars: EnvVar[] }
  | { type: "load-error"; error: string; status: Status }
  | { type: "paste-text"; value: string }
  | { type: "remove-row"; id: string }
  | { type: "save-error"; error: string }
  | { type: "save-start" }
  | { type: "saved-idle" }
  | { type: "set-error"; error: string; status?: Status }
  | { type: "set-status"; status: Status }
  | { type: "start-adding" }
  | { type: "start-pasting" }
  | { type: "submit-draft"; id: string; name: string; value: string }
  | { type: "toggle-reveal"; id: string }
  | { type: "toggle-reveal-all" }
  | { type: "update-row"; id: string; patch: Partial<EnvVar> }

function createEnvironmentPanelState({
  initialEntries,
  sandboxId,
}: {
  initialEntries?: EnvVar[]
  sandboxId: string | null
}): EnvironmentPanelState {
  const entries = initialEntries ? cloneEntries(initialEntries) : []
  return {
    adding: false,
    draftName: "",
    draftValue: "",
    error: null,
    original: entries,
    pasteText: "",
    pasting: false,
    revealed: new Set(),
    rows: rowsFromEntries(entries),
    status: sandboxId && !initialEntries ? "loading" : "idle",
  }
}

function environmentPanelReducer(
  state: EnvironmentPanelState,
  action: EnvironmentPanelAction
): EnvironmentPanelState {
  switch (action.type) {
    case "apply-entries": {
      const next = cloneEntries(action.entries)
      return {
        ...state,
        adding: false,
        draftName: "",
        draftValue: "",
        error: null,
        original: next,
        pasteText: "",
        pasting: false,
        revealed: new Set(),
        rows: rowsFromEntries(next),
        status: action.status ?? state.status,
      }
    }
    case "cancel-draft":
      return {
        ...state,
        adding: false,
        draftName: "",
        draftValue: "",
        error: null,
      }
    case "cancel-pasting":
      return { ...state, error: null, pasteText: "", pasting: false }
    case "draft-name":
      return { ...state, draftName: action.value }
    case "draft-value":
      return { ...state, draftValue: action.value }
    case "import-pasted": {
      const rows = [...state.rows]
      const indexByName = new Map(
        rows.map((row, index) => [row.name.trim(), index])
      )

      for (const entry of action.vars) {
        const existingIndex = indexByName.get(entry.name)
        if (existingIndex !== undefined) {
          rows[existingIndex] = { ...rows[existingIndex], value: entry.value }
        } else {
          rows.push({ id: makeId(), name: entry.name, value: entry.value })
          indexByName.set(entry.name, rows.length - 1)
        }
      }

      return { ...state, error: null, pasteText: "", pasting: false, rows }
    }
    case "load-error":
      return { ...state, error: action.error, status: action.status }
    case "paste-text":
      return { ...state, pasteText: action.value }
    case "remove-row": {
      const revealed = new Set(state.revealed)
      revealed.delete(action.id)
      return {
        ...state,
        revealed,
        rows: state.rows.filter((row) => row.id !== action.id),
      }
    }
    case "save-error":
      return { ...state, error: action.error, status: "error" }
    case "save-start":
      return { ...state, error: null, status: "saving" }
    case "saved-idle":
      return { ...state, status: "idle" }
    case "set-error":
      return {
        ...state,
        error: action.error,
        status: action.status ?? state.status,
      }
    case "set-status":
      return { ...state, status: action.status }
    case "start-adding":
      return { ...state, adding: true, error: null }
    case "start-pasting":
      return { ...state, error: null, pasting: true }
    case "submit-draft": {
      const rows = [
        ...state.rows,
        { id: action.id, name: action.name, value: action.value },
      ]
      const revealed = new Set(state.revealed)
      if (action.value) revealed.add(action.id)
      return {
        ...state,
        adding: false,
        draftName: "",
        draftValue: "",
        error: null,
        revealed,
        rows,
      }
    }
    case "toggle-reveal": {
      const revealed = new Set(state.revealed)
      if (revealed.has(action.id)) revealed.delete(action.id)
      else revealed.add(action.id)
      return { ...state, revealed }
    }
    case "toggle-reveal-all": {
      const allRevealed =
        state.rows.length > 0 &&
        state.rows.every((row) => state.revealed.has(row.id))
      return {
        ...state,
        revealed: allRevealed
          ? new Set()
          : new Set(state.rows.map((row) => row.id)),
      }
    }
    case "update-row":
      return {
        ...state,
        rows: state.rows.map((row) =>
          row.id === action.id ? { ...row, ...action.patch } : row
        ),
      }
  }
}

const envCache = new Map<string, EnvVar[]>()

function makeId() {
  return Math.random().toString(36).slice(2, 10)
}

function cloneEntries(entries: EnvVar[]) {
  return entries.map((entry) => ({ name: entry.name, value: entry.value }))
}

function rowsFromEntries(entries: EnvVar[]): LocalRow[] {
  return entries.map((entry) => ({ ...entry, id: makeId() }))
}

function entriesFromRows(rows: LocalRow[]): EnvVar[] {
  return rows.map((row) => ({
    name: row.name.trim(),
    value: row.value,
  }))
}

function maskedDots(value: string) {
  const length = Math.min(Math.max(value.length, 6), 18)
  return "•".repeat(length)
}

function entriesEqual(rows: LocalRow[], original: EnvVar[]) {
  if (rows.length !== original.length) return false

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const entry = original[index]
    if (row.name !== entry.name || row.value !== entry.value) return false
  }

  return true
}

function validateEntries(entries: EnvVar[]) {
  const seen = new Set<string>()

  for (const entry of entries) {
    const name = entry.name.trim()

    if (!ENV_NAME_PATTERN.test(name)) {
      return `Invalid name "${name || "(empty)"}"`
    }

    if (seen.has(name)) {
      return `Duplicate variable "${name}"`
    }

    seen.add(name)
  }

  return null
}

async function fetchEntries(sandboxId: string, signal?: AbortSignal) {
  const res = await fetch(
    `/api/sandbox/env?${new URLSearchParams({ sandboxId })}`,
    { cache: "no-store", credentials: "same-origin", signal }
  )
  const data = (await res.json()) as { entries?: EnvVar[]; error?: string }

  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`)
  }

  return data.entries ?? []
}

function useEnvironmentPanelController(sandboxId: string | null) {
  const initialEntries = sandboxId ? envCache.get(sandboxId) : undefined
  const [state, dispatch] = useReducer(
    environmentPanelReducer,
    { initialEntries, sandboxId },
    createEnvironmentPanelState
  )
  const {
    adding,
    draftName,
    draftValue,
    error,
    original,
    pasteText,
    pasting,
    revealed,
    rows,
    status,
  } = state
  const dirtyRef = useRef(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDirty = useMemo(() => !entriesEqual(rows, original), [original, rows])
  const pasteParsed = useMemo(() => parseDotenv(pasteText), [pasteText])
  const pasteVars = useMemo(
    () => dedupeEnvVars(pasteParsed.vars),
    [pasteParsed]
  )
  const setPasteTextareaRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      node?.focus()
    },
    []
  )
  const updatePasteText = useCallback((value: string) => {
    dispatch({ type: "paste-text", value })
  }, [])

  useEffect(() => {
    dirtyRef.current = isDirty
  }, [isDirty])

  const clearSavedTimer = useCallback(() => {
    if (!savedTimer.current) return
    clearTimeout(savedTimer.current)
    savedTimer.current = null
  }, [])

  useEffect(() => {
    if (!sandboxId) return

    const controller = new AbortController()
    dirtyRef.current = false

    void fetchEntries(sandboxId, controller.signal)
      .then((entries) => {
        envCache.set(sandboxId, cloneEntries(entries))
        if (!dirtyRef.current) {
          dispatch({ type: "apply-entries", entries, status: "idle" })
        } else {
          dispatch({ type: "set-status", status: "idle" })
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        dispatch({
          type: "load-error",
          error: err instanceof Error ? err.message : "Failed to load",
          status: initialEntries ? "idle" : "error",
        })
      })

    return () => controller.abort()
  }, [initialEntries, sandboxId])

  useEffect(() => clearSavedTimer, [clearSavedTimer])

  const updateRow = useCallback((id: string, patch: Partial<EnvVar>) => {
    dirtyRef.current = true
    dispatch({ type: "update-row", id, patch })
  }, [])

  const toggleReveal = useCallback((id: string) => {
    dispatch({ type: "toggle-reveal", id })
  }, [])

  const allRevealed =
    rows.length > 0 && rows.every((row) => revealed.has(row.id))

  const toggleRevealAll = useCallback(() => {
    dispatch({ type: "toggle-reveal-all" })
  }, [])

  const startAdding = useCallback(() => {
    dirtyRef.current = true
    dispatch({ type: "start-adding" })
  }, [])

  const updateDraftName = useCallback((value: string) => {
    dirtyRef.current = true
    dispatch({ type: "draft-name", value })
  }, [])

  const updateDraftValue = useCallback((value: string) => {
    dirtyRef.current = true
    dispatch({ type: "draft-value", value })
  }, [])

  const submitDraft = useCallback(() => {
    const name = draftName.trim()

    if (!name) return

    if (!ENV_NAME_PATTERN.test(name)) {
      dispatch({ type: "set-error", error: `Invalid name "${name}"` })
      return
    }

    if (rows.some((row) => row.name.trim() === name)) {
      dispatch({ type: "set-error", error: `Duplicate variable "${name}"` })
      return
    }

    const id = makeId()
    dirtyRef.current = true
    dispatch({ type: "submit-draft", id, name, value: draftValue })
  }, [draftName, draftValue, rows])

  const cancelDraft = useCallback(() => {
    dispatch({ type: "cancel-draft" })
  }, [])

  const startPasting = useCallback(() => {
    dispatch({ type: "start-pasting" })
  }, [])

  const cancelPasting = useCallback(() => {
    dispatch({ type: "cancel-pasting" })
  }, [])

  const importPasted = useCallback(() => {
    if (pasteVars.length === 0) return

    dirtyRef.current = true
    dispatch({ type: "import-pasted", vars: pasteVars })
  }, [pasteVars])

  const persistEntries = useCallback(
    async (allEntries: EnvVar[]) => {
      if (!sandboxId) return false

      const validationError = validateEntries(allEntries)

      if (validationError) {
        dispatch({ type: "set-error", error: validationError, status: "error" })
        return false
      }

      dispatch({ type: "save-start" })

      try {
        const res = await fetch("/api/sandbox/env", {
          body: JSON.stringify({ entries: allEntries, sandboxId }),
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
        const data = (await res.json()) as {
          entries?: EnvVar[]
          error?: string
          ok?: boolean
        }

        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? `Request failed (${res.status})`)
        }

        const next = cloneEntries(data.entries ?? allEntries)
        envCache.set(sandboxId, next)
        dispatch({ type: "apply-entries", entries: next, status: "saved" })

        clearSavedTimer()
        savedTimer.current = setTimeout(
          () => dispatch({ type: "saved-idle" }),
          1500
        )
        return true
      } catch (err) {
        dispatch({
          type: "save-error",
          error: err instanceof Error ? err.message : "Failed to save",
        })
        return false
      }
    },
    [clearSavedTimer, sandboxId]
  )

  const removeRow = useCallback(
    (id: string) => {
      if (status === "saving") return

      const nextRows = rows.filter((row) => row.id !== id)
      dirtyRef.current = true
      dispatch({ type: "remove-row", id })

      void persistEntries(entriesFromRows(nextRows))
    },
    [persistEntries, rows, status]
  )

  const save = useCallback(async () => {
    if (!sandboxId || status === "saving") return

    const entries = entriesFromRows(rows)
    const draftEntry =
      adding && draftName.trim()
        ? [{ name: draftName.trim(), value: draftValue }]
        : []
    const allEntries = [...entries, ...draftEntry]
    const validationError = validateEntries(allEntries)

    if (validationError) {
      dispatch({ type: "set-error", error: validationError, status: "error" })
      return
    }

    await persistEntries(allEntries)
  }, [adding, draftName, draftValue, persistEntries, rows, sandboxId, status])

  const isLoadingInitial = status === "loading" && rows.length === 0
  const isEmpty = rows.length === 0 && !adding && !pasting && !isLoadingInitial
  const showRevealAll = rows.length > 0
  const dirty = isDirty || adding
  const saving = status === "saving"

  return {
    adding,
    allRevealed,
    cancelDraft,
    cancelPasting,
    dirty,
    draftName,
    draftValue,
    error,
    importPasted,
    isEmpty,
    isLoadingInitial,
    pasteParsed,
    pasteText,
    pasteVars,
    pasting,
    removeRow,
    revealed,
    rows,
    save,
    saving,
    setPasteTextareaRef,
    showRevealAll,
    startAdding,
    startPasting,
    status,
    submitDraft,
    toggleReveal,
    toggleRevealAll,
    updateDraftName,
    updateDraftValue,
    updatePasteText,
    updateRow,
  }
}

export function EnvironmentPanel({ sandboxId }: { sandboxId: string | null }) {
  const {
    adding,
    allRevealed,
    cancelDraft,
    cancelPasting,
    dirty,
    draftName,
    draftValue,
    error,
    importPasted,
    isEmpty,
    isLoadingInitial,
    pasteParsed,
    pasteText,
    pasteVars,
    pasting,
    removeRow,
    revealed,
    rows,
    save,
    saving,
    setPasteTextareaRef,
    showRevealAll,
    startAdding,
    startPasting,
    status,
    submitDraft,
    toggleReveal,
    toggleRevealAll,
    updateDraftName,
    updateDraftValue,
    updatePasteText,
    updateRow,
  } = useEnvironmentPanelController(sandboxId)

  if (!sandboxId) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-xs text-muted-foreground">No active sandbox.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-4 pb-4">
        <div className="flex items-center justify-between gap-2 px-0.5 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-medium text-foreground/85">
              Secrets
            </h2>
            {status === "loading" ? (
              <Loader2
                aria-label="Refreshing"
                className="size-3 animate-spin text-muted-foreground"
              />
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {showRevealAll ? (
              <IconButton
                aria-label={allRevealed ? "Hide values" : "Reveal values"}
                aria-pressed={allRevealed}
                title={allRevealed ? "Hide values" : "Reveal values"}
                onClick={toggleRevealAll}
              >
                {allRevealed ? (
                  <EyeOff className="size-3.5" />
                ) : (
                  <Eye className="size-3.5" />
                )}
              </IconButton>
            ) : null}
            <IconButton
              aria-label="Paste .env file"
              aria-pressed={pasting}
              title="Paste .env file"
              onClick={pasting ? cancelPasting : startPasting}
            >
              <ClipboardPaste className="size-3.5" />
            </IconButton>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Add variable"
              onClick={startAdding}
            >
              <Plus />
              Add
            </Button>
          </div>
        </div>

        {pasting ? (
          <div className={cn("mb-3 overflow-hidden", cardSurfaceClass)}>
            <Textarea
              ref={setPasteTextareaRef}
              variant="bare"
              aria-label="Paste .env file contents"
              className="block max-h-72 min-h-32 resize-y px-4 py-3 text-[13px] leading-5 text-foreground"
              onChange={(event) => updatePasteText(event.target.value)}
              placeholder={
                "# Paste your .env file\nAPI_KEY=sk-...\nDATABASE_URL=postgres://..."
              }
              spellCheck={false}
              value={pasteText}
            />
            <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/30 px-4 py-2.5">
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                {pasteVars.length > 0
                  ? `${pasteVars.length} variable${
                      pasteVars.length === 1 ? "" : "s"
                    }${
                      pasteParsed.errors.length
                        ? ` · ${pasteParsed.errors.length} line${
                            pasteParsed.errors.length === 1 ? "" : "s"
                          } skipped`
                        : ""
                    }`
                  : pasteText.trim()
                    ? "No valid variables found"
                    : ""}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelPasting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pasteVars.length === 0}
                  onClick={importPasted}
                >
                  {pasteVars.length > 0 ? `Add ${pasteVars.length}` : "Add"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {isLoadingInitial ? (
          <div className={cn("grid h-32 place-items-center", cardSurfaceClass)}>
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : isEmpty ? (
          <EmptyState onAdd={startAdding} />
        ) : rows.length > 0 || adding ? (
          <div className={cn("overflow-hidden", cardSurfaceClass)}>
            <ul>
              {rows.map((row) => (
                <EnvRow
                  key={row.id}
                  onChange={(patch) => updateRow(row.id, patch)}
                  onRemove={() => removeRow(row.id)}
                  onToggleReveal={() => toggleReveal(row.id)}
                  revealed={revealed.has(row.id)}
                  row={row}
                  saving={saving}
                />
              ))}
              {adding ? (
                <DraftRow
                  name={draftName}
                  onCancel={cancelDraft}
                  onChangeName={updateDraftName}
                  onChangeValue={updateDraftValue}
                  onSubmit={submitDraft}
                  value={draftValue}
                />
              ) : null}
            </ul>

            {error ? (
              <div className="flex items-start gap-1.5 border-t border-border/60 bg-destructive/10 px-3.5 py-2 text-[11px] text-destructive">
                <TriangleAlert className="mt-px size-3 shrink-0" />
                <span className="break-words">{error}</span>
              </div>
            ) : null}

            {dirty ? (
              <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/30 px-4 py-2.5">
                <span className="text-[11px] text-muted-foreground">
                  Unsaved changes
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={save}
                >
                  {saving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : null}
                  Save
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {(isLoadingInitial || isEmpty) && error ? (
          <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
            <TriangleAlert className="mt-px size-3 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const nameInputClass = cn(
  "w-full min-w-0 border-0 bg-transparent p-0 outline-none",
  "text-[13px] font-medium text-foreground",
  "placeholder:font-medium placeholder:text-muted-foreground/40"
)

const valueInputClass = cn(
  "w-full min-w-0 border-0 bg-transparent p-0 outline-none",
  "text-[13px] text-muted-foreground",
  "placeholder:text-muted-foreground/40 focus:text-foreground/80"
)

function handleDraftKey(
  event: KeyboardEvent<HTMLInputElement>,
  submit: () => void,
  cancel: () => void
) {
  if (event.key === "Enter") {
    event.preventDefault()
    submit()
  } else if (event.key === "Escape") {
    event.preventDefault()
    cancel()
  }
}

function EnvRow({
  row,
  revealed,
  onChange,
  onRemove,
  onToggleReveal,
  saving,
}: {
  row: LocalRow
  revealed: boolean
  onChange: (patch: Partial<EnvVar>) => void
  onRemove: () => void
  onToggleReveal: () => void
  saving: boolean
}) {
  return (
    <li className="group flex items-center gap-3 border-b border-border/50 px-4 py-3 transition-colors last:border-b-0 focus-within:bg-muted/30 hover:bg-muted/30">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Input
          variant="bare"
          aria-label="Variable name"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className={nameInputClass}
          onChange={(event) => onChange({ name: event.target.value })}
          spellCheck={false}
          value={row.name}
        />
        <Input
          variant="bare"
          aria-label={`${row.name || "Variable"} value`}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className={valueInputClass}
          data-1p-ignore
          data-lpignore="true"
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder={row.value ? maskedDots(row.value) : "(empty)"}
          spellCheck={false}
          type={revealed ? "text" : "password"}
          value={row.value}
        />
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <RowIconButton
          label={revealed ? "Hide value" : "Reveal value"}
          onClick={onToggleReveal}
          disabled={saving}
        >
          {revealed ? (
            <EyeOff className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
        </RowIconButton>
        <RowIconButton
          label="Delete variable"
          onClick={onRemove}
          disabled={saving}
        >
          <Trash2 className="size-3.5" />
        </RowIconButton>
      </div>
    </li>
  )
}

function DraftRow({
  name,
  value,
  onCancel,
  onChangeName,
  onChangeValue,
  onSubmit,
}: {
  name: string
  value: string
  onCancel: () => void
  onChangeName: (value: string) => void
  onChangeValue: (value: string) => void
  onSubmit: () => void
}) {
  const setNameInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus()
  }, [])

  return (
    <li className="flex items-center gap-3 border-b border-border/50 bg-muted/30 px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Input
          ref={setNameInputRef}
          variant="bare"
          aria-label="Variable name"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className={nameInputClass}
          onChange={(event) => onChangeName(event.target.value)}
          onKeyDown={(event) => handleDraftKey(event, onSubmit, onCancel)}
          placeholder="Name"
          spellCheck={false}
          value={name}
        />
        <Input
          variant="bare"
          aria-label="Variable value"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className={valueInputClass}
          data-1p-ignore
          data-lpignore="true"
          onChange={(event) => onChangeValue(event.target.value)}
          onKeyDown={(event) => handleDraftKey(event, onSubmit, onCancel)}
          placeholder="value"
          spellCheck={false}
          type="password"
          value={value}
        />
      </div>
      <RowIconButton label="Discard new variable" onClick={onCancel}>
        <Trash2 className="size-3.5" />
      </RowIconButton>
    </li>
  )
}

function RowIconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <IconButton
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      title={label}
    >
      {children}
    </IconButton>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        cardSurfaceClass
      )}
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-medium text-foreground/80">No secrets yet</p>
        <p className="text-[11px] text-muted-foreground">
          Add a variable to the sandbox&apos;s .env.local.
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onAdd}>
        <Plus />
        Add variable
      </Button>
    </div>
  )
}
