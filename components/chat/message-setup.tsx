"use client"

import { memo, useEffect, useRef, useState } from "react"
import unicodeSpinners from "unicode-animations"

import {
  visibleSetupSummaryLogs,
  type ChatRunLog,
} from "@/components/chat/message-model"

/* Whimsical stand-ins for the real setup statuses (queued run, connecting to
   Daytona, resources...). Order is shuffled-feeling but fixed so the rotation
   is deterministic across renders. */
const SETUP_PHRASES = [
  "Terminating competitors",
  "Counting sheep",
  "Orbiting",
  "Increasing ARR",
  "Warming up the hamsters",
  "Nucleating",
  "Tomfoolering",
  "Aligning the stars",
  "Brewing coffee",
  "Summoning electrons",
  "CloudCoding",
]

/* Real setup work worth surfacing verbatim (downloads, cloudcode.yaml
   scanning, sandbox creation, cloning, install scripts). Anything else gets
   the whimsy. */
const INFORMATIVE_PATTERNS = [
  /downloading/i,
  /cloudcode\.yaml/i,
  /creating .*sandbox/i,
  /sandbox ready/i,
  /cloning|cloned/i,
  /environment scan/i,
  /install script/i,
  /path setup script/i,
  /preset secret/i,
  /app-server daemon/i,
]

function informativeMessage(log: ChatRunLog | undefined) {
  if (!log) return null
  if (log.kind === "command") {
    /* The main run path logs the clone as a raw `git clone <url>` command;
       surface it as a friendly label instead of the URL. */
    if (log.message.startsWith("git clone")) return "Cloning repository"
    /* cloudcode.yaml setup commands (npm install, etc.) log a friendly
       `Downloading <name>` message with the raw command in detail. */
    if (/^downloading /i.test(log.message)) return log.message
    /* The app-server daemon launch is logged as the raw `codex app-server`
       command; give it a friendly label. */
    if (log.message.startsWith("codex app-server")) {
      return "Starting Codex app server"
    }
    return null
  }
  if (log.kind !== "setup") return null
  return INFORMATIVE_PATTERNS.some((pattern) => pattern.test(log.message))
    ? log.message
    : null
}

const PHRASE_MIN_MS = 7000
const PHRASE_MAX_MS = 8500

function randomPhraseDelay() {
  return PHRASE_MIN_MS + Math.random() * (PHRASE_MAX_MS - PHRASE_MIN_MS)
}

function randomPhraseIndex(exclude: number) {
  const index = Math.floor(Math.random() * (SETUP_PHRASES.length - 1))
  return index >= exclude ? index + 1 : index
}

/* Starts on a random phrase and hops to another random one at a randomized
   moderate cadence while `rotate` is on (off while a real status is shown).
   The initial index is random from the first render — a pending run never
   renders during SSR (Convex queries resolve client-side), so there is no
   server markup to mismatch, and lazy-random avoids the one-frame flash of
   phrase 0 that a post-mount effect would cause. */
function useSetupPhrase(rotate: boolean) {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * SETUP_PHRASES.length)
  )

  useEffect(() => {
    if (!rotate) return
    let timer: ReturnType<typeof setTimeout>
    const scheduleNext = () => {
      timer = setTimeout(() => {
        setIndex((current) => randomPhraseIndex(current))
        scheduleNext()
      }, randomPhraseDelay())
    }
    scheduleNext()
    return () => clearTimeout(timer)
  }, [rotate])

  return SETUP_PHRASES[index]
}

/* Minimum time an informative status stays on screen. Real statuses are often
   chased ~100ms later by a non-informative log ("Daytona sandbox ready" then
   "Sandbox resources: ..."), and snapping back to whimsy that fast reads as a
   flicker of stale text. A newer informative status replaces the current one
   immediately; only the fallback to whimsy waits out the dwell. */
const STATUS_DWELL_MS = 4000

function useDwelledStatus(realStatus: string | null) {
  const [shown, setShown] = useState<string | null>(null)
  const shownAtRef = useRef(0)

  useEffect(() => {
    if (realStatus) {
      shownAtRef.current = Date.now()
      setShown(realStatus)
      return
    }
    if (!shown) return
    const remaining = STATUS_DWELL_MS - (Date.now() - shownAtRef.current)
    if (remaining <= 0) {
      setShown(null)
      return
    }
    const timer = setTimeout(() => setShown(null), remaining)
    return () => clearTimeout(timer)
  }, [realStatus, shown])

  return shown
}

/* All unicode-animations spinners except the plain classic `braille` one. */
const SPINNERS = Object.entries(unicodeSpinners)
  .filter(([name]) => name !== "braille")
  .map(([, spinner]) => spinner)

/* Picks a random spinner per run (lazy-random for the same SSR-safe reason
   as the phrases) and steps its frames. */
function useSpinnerFrame() {
  const [spinnerIndex] = useState(() =>
    Math.floor(Math.random() * SPINNERS.length)
  )
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const timer = setInterval(
      () => setFrame((current) => current + 1),
      SPINNERS[spinnerIndex].interval
    )
    return () => clearInterval(timer)
  }, [spinnerIndex])

  const spinner = SPINNERS[spinnerIndex]
  return spinner.frames[frame % spinner.frames.length]
}

const LETTER_STAGGER_MS = 55

/* Per-letter shimmer: each character animates with a staggered delay so a
   brighten-and-bounce wave travels across the text. Spaces become &nbsp; so
   the inline-block spans don't collapse them.

   The wave must run as one continuous loop even while the phrase changes
   underneath it. Letters are keyed by position so existing spans keep
   animating when their character swaps, and every letter's delay is anchored
   to the component's first paint (mount epoch): a letter that mounts later —
   e.g. a longer phrase arrives — gets `index * stagger - timeSinceEpoch`,
   which drops it into the shared timeline mid-cycle instead of starting its
   own out-of-phase wave. Delays are frozen per position so re-renders never
   restart the CSS animation. Delays apply only after hydration (the epoch is
   client time, so SSR markup must not include it). */
const ShimmerText = memo(function ShimmerText({ text }: { text: string }) {
  const [mounted, setMounted] = useState(false)
  const epochRef = useRef<number | null>(null)
  const delaysRef = useRef<number[]>([])
  const prevCountRef = useRef(0)

  useEffect(() => setMounted(true), [])

  const letters = Array.from(text)

  /* A CSS animation restarts whenever its span (re)mounts, so a delay is only
     valid for the mount it was computed for. Spans at indexes below the
     previous letter count persist across this render and must keep their
     delays untouched; anything at or past it is mounting fresh (longer
     phrase, or re-grown after a shorter one) and needs a delay computed
     against the shared epoch *now*, otherwise it animates on its own timeline
     and the wave splits. */
  if (mounted) {
    const now = performance.now()
    epochRef.current ??= now
    for (let index = prevCountRef.current; index < letters.length; index++) {
      delaysRef.current[index] =
        index * LETTER_STAGGER_MS - (now - epochRef.current)
    }
    prevCountRef.current = letters.length
  }

  return (
    <span aria-label={text} className="block truncate">
      {letters.map((letter, index) => {
        const delay = delaysRef.current[index]
        return (
          <span
            key={index}
            aria-hidden
            className="shimmer-letter"
            style={
              delay === undefined ? undefined : { animationDelay: `${delay}ms` }
            }
          >
            {letter === " " ? "\u00A0" : letter}
          </span>
        )
      })}
    </span>
  )
})

/* The single in-progress setup line for a thread. Rendered by the thread view
   in place of the last pending assistant message and keyed by the thread —
   NOT per message — so its phrase/spinner/status state survives the
   optimistic-to-server message swap during send, and finished messages can
   never flash a setup line of their own. It unmounts (resetting all state)
   the moment content starts streaming or the run resolves. */
export const RunSetupSummary = memo(function RunSetupSummary({
  createdAt,
  logs,
}: {
  createdAt?: number
  logs: ChatRunLog[]
}) {
  /* A log older than the message itself can only belong to a previous run —
     this run's logs are always written after its message is created — so
     drop them instead of surfacing a stale status. */
  const setupLogs = visibleSetupSummaryLogs(logs).filter(
    (log) => !createdAt || log.time >= createdAt
  )
  const realStatus = informativeMessage(setupLogs.at(-1))
  const shownStatus = useDwelledStatus(realStatus)
  const phrase = useSetupPhrase(!shownStatus)
  const spinnerFrame = useSpinnerFrame()

  return (
    <div className="flex min-w-0 items-center gap-2 text-[13px]">
      <span aria-hidden className="shrink-0 font-mono text-muted-foreground">
        {spinnerFrame}
      </span>
      <ShimmerText text={shownStatus ?? phrase} />
    </div>
  )
})
