import type { ChatImageAttachment } from "./chat-attachments"
import type { CodexSpeed, ReasoningEffort } from "./codex-run-options"
import type { CodexRunLog as RunCodexLog } from "./codex-run-log"
import type { McpServerInput } from "./daytona-codex-runtime"
import type { DaytonaDesktopRecordingArtifact } from "./daytona-desktop"
import type { McpDiscoveredServer } from "./mcp-discovery"
import type { SandboxPresetEnvVar } from "./sandbox-env"

export type SandboxPresetInput = {
  cloudcodeYaml?: string
  daytonaSnapshot?: string
  installScript?: string
  mode?: "manual" | "auto"
  name: string
  pathInstallScript?: string
  secrets: SandboxPresetEnvVar[]
}

export type RunCodexInSandboxInput = {
  authJson: string
  baseBranch?: string
  branchMode?: "auto" | "custom" | "base"
  branchName?: string
  codexThreadId?: string
  convexUrl?: string
  githubToken?: string
  githubUserEmail?: string
  githubUserName?: string
  githubUsername?: string
  imageAttachments?: ChatImageAttachment[]
  mcpServers?: McpServerInput[]
  model?: string
  notesAccessToken?: string
  onContentDelta?: (delta: string) => void | Promise<void>
  onLog?: (log: RunCodexLog) => void | Promise<void>
  onMcpServerToolsDiscovered?: (
    servers: McpDiscoveredServer[]
  ) => void | Promise<void>
  previousDiff?: string
  prompt: string
  reasoningEffort?: ReasoningEffort
  resumeContext?: string
  repoUrl: string
  runId?: string
  sandboxId?: string
  sandboxPreset?: SandboxPresetInput
  signal?: AbortSignal
  speed?: CodexSpeed
  threadId?: string
  userId?: string
}

export type RunCodexInSandboxResult = {
  branchName: string
  codexThreadId?: string
  desktopRecording?: DaytonaDesktopRecordingArtifact
  diff: string
  exitCode: number
  lastMessage: string
  lastMessageAuthoritative?: boolean
  repoUrl: string
  sandboxId: string
  stderr: string
  status: string
  stdout: string
  updatedAuthJson: string
  recoveredSandbox: boolean
}
