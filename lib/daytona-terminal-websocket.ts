import type { Sandbox } from "@daytona/sdk"
import daytonaSdkPackage from "@daytona/sdk/package.json"

import {
  daytonaTerminalPath,
  getStartedDaytonaSandbox,
  resolveDaytonaPaths,
} from "./daytona-sandbox"
import { refreshDaytonaTerminalGitHubAuth } from "./daytona-terminal-sessions"

type SandboxClientConfig = {
  clientConfig?: {
    baseOptions?: {
      headers?: Record<string, unknown>
    }
  }
}

export type DaytonaTerminalWebSocket = {
  protocol: string
  sessionId: string
  wsUrl: string
}

function cleanTerminalId(terminalId: string) {
  const trimmed = terminalId.trim()
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(trimmed)) {
    throw new Error("Invalid terminal id.")
  }
  return trimmed
}

function cleanSize(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function toolboxBasePath(sandbox: Sandbox) {
  let baseUrl = sandbox.toolboxProxyUrl
  if (!baseUrl.endsWith("/")) baseUrl += "/"
  return `${baseUrl}${sandbox.id}`
}

function toolboxHeaders(sandbox: Sandbox) {
  const headers =
    (sandbox as unknown as SandboxClientConfig).clientConfig?.baseOptions
      ?.headers ?? {}

  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  )
}

async function toolboxErrorMessage(response: Response, fallback: string) {
  const text = await response.text().catch(() => "")
  if (!text) return fallback

  try {
    const parsed = JSON.parse(text) as { message?: unknown; error?: unknown }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message
    }
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error
    }
  } catch {
    // Plain text toolbox errors are still useful.
  }

  return text.trim() || fallback
}

async function createPtySession({
  cols,
  cwd,
  envs,
  rows,
  sandbox,
  terminalId,
}: {
  cols: number
  cwd: string
  envs: Record<string, string>
  rows: number
  sandbox: Sandbox
  terminalId: string
}) {
  const response = await fetch(`${toolboxBasePath(sandbox)}/process/pty`, {
    body: JSON.stringify({
      cols,
      cwd,
      envs,
      id: terminalId,
      lazyStart: true,
      rows,
    }),
    cache: "no-store",
    headers: {
      ...toolboxHeaders(sandbox),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  })

  if (response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      sessionId?: unknown
    }
    return typeof data.sessionId === "string" && data.sessionId.trim()
      ? data.sessionId
      : terminalId
  }

  if (response.status === 409) return terminalId

  throw new Error(
    await toolboxErrorMessage(response, "Unable to create Daytona terminal.")
  )
}

function terminalWebSocketUrl({
  previewToken,
  sandbox,
  sessionId,
}: {
  previewToken: string
  sandbox: Sandbox
  sessionId: string
}) {
  const url = new URL(
    `${toolboxBasePath(sandbox).replace(/^http/, "ws")}/process/pty/${encodeURIComponent(
      sessionId
    )}/connect`
  )
  if (previewToken) {
    url.searchParams.set("DAYTONA_SANDBOX_AUTH_KEY", previewToken)
  }
  return url.toString()
}

export async function prepareDaytonaTerminalWebSocket({
  cols,
  githubToken,
  githubTokenExpiresAt,
  githubUserEmail,
  githubUserName,
  githubUsername,
  repoUrl,
  rows,
  sandboxId,
  terminalId,
}: {
  cols?: number
  githubToken?: string
  githubTokenExpiresAt?: string
  githubUserEmail?: string
  githubUserName?: string
  githubUsername?: string | null
  repoUrl?: string
  rows?: number
  sandboxId: string
  terminalId: string
}): Promise<DaytonaTerminalWebSocket> {
  const cleanId = cleanTerminalId(terminalId)
  const safeCols = cleanSize(cols, 100, 20, 300)
  const safeRows = cleanSize(rows, 30, 8, 120)
  const sandbox = await getStartedDaytonaSandbox(sandboxId)
  const paths = await resolveDaytonaPaths(sandbox)
  const githubAuth = await refreshDaytonaTerminalGitHubAuth({
    githubToken,
    githubTokenExpiresAt,
    githubUserEmail,
    githubUserName,
    githubUsername,
    paths,
    repoUrl,
    sandbox,
    sandboxId,
    terminalId: cleanId,
  })

  const envs = {
    CLICOLOR: "1",
    COLORTERM: "truecolor",
    CODEX_HOME: paths.codexHome,
    FORCE_COLOR: "1",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    PATH: daytonaTerminalPath(paths.home),
    TERM: "xterm-256color",
    ...githubAuth?.env,
  }

  let sessionId = cleanId
  const existingSession = await sandbox.process
    .getPtySessionInfo(cleanId)
    .catch(() => null)
  if (existingSession) {
    await sandbox.process.resizePtySession(cleanId, safeCols, safeRows)
  } else {
    sessionId = await createPtySession({
      cols: safeCols,
      cwd: paths.repoPath,
      envs,
      rows: safeRows,
      sandbox,
      terminalId: cleanId,
    }).catch(async (error: unknown) => {
      const racedSession = await sandbox.process
        .getPtySessionInfo(cleanId)
        .catch(() => null)
      if (!racedSession) throw error
      await sandbox.process.resizePtySession(cleanId, safeCols, safeRows)
      return cleanId
    })
  }

  const previewToken = (await sandbox.getPreviewLink(1)).token ?? ""
  return {
    protocol: `X-Daytona-SDK-Version~${daytonaSdkPackage.version}`,
    sessionId,
    wsUrl: terminalWebSocketUrl({ previewToken, sandbox, sessionId }),
  }
}

export async function resizeDaytonaTerminalWebSocket({
  cols,
  rows,
  sandboxId,
  terminalId,
}: {
  cols: number
  rows: number
  sandboxId: string
  terminalId: string
}) {
  const sandbox = await getStartedDaytonaSandbox(sandboxId)
  await sandbox.process.resizePtySession(
    cleanTerminalId(terminalId),
    cleanSize(cols, 100, 20, 300),
    cleanSize(rows, 30, 8, 120)
  )
}
