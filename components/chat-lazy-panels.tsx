"use client"

import dynamic from "next/dynamic"

export const FileBrowser = dynamic(
  () => import("@/components/file-browser").then((mod) => mod.FileBrowser),
  { ssr: false }
)

export const loadSandboxTerminalPanel = () =>
  import("@/components/sandbox-terminal").then(
    (mod) => mod.SandboxTerminalPanel
  )

export const SandboxTerminalPanel = dynamic(loadSandboxTerminalPanel, {
  ssr: false,
})

export const GithubPanel = dynamic(
  () => import("@/components/github-panel").then((mod) => mod.GithubPanel),
  { ssr: false }
)

export const SandboxDesktopPanel = dynamic(
  () =>
    import("@/components/sandbox-desktop").then(
      (mod) => mod.SandboxDesktopPanel
    ),
  { ssr: false }
)

export const SshPanel = dynamic(
  () => import("@/components/ssh-panel").then((mod) => mod.SshPanel),
  { ssr: false }
)

export const FileEditorPanel = dynamic(
  () => import("@/components/file-editor").then((mod) => mod.FileEditorPanel),
  { ssr: false }
)

export const ChatContextPanel = dynamic(
  () =>
    import("@/components/chat-context-panel").then(
      (mod) => mod.ChatContextPanel
    ),
  { ssr: false }
)
