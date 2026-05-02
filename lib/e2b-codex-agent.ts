import { Sandbox } from "e2b"

const CODEX_HOME = "/home/user/.codex"
const REPO_PATH = "/home/user/repo"
const PROMPT_PATH = "/tmp/cloudcode-prompt.txt"
const LAST_MESSAGE_PATH = "/tmp/cloudcode-last-message.txt"
const EXIT_MARKER = "__CLOUDCODE_CODEX_EXIT__"

type CommandResult = {
  exitCode: number
  stderr: string
  stdout: string
}

export type RunCodexInSandboxInput = {
  authJson: string
  baseBranch?: string
  branchName?: string
  githubToken?: string
  model?: string
  prompt: string
  repoUrl: string
  timeoutMs?: number
}

export type RunCodexInSandboxResult = {
  branchName: string
  diff: string
  exitCode: number
  lastMessage: string
  repoUrl: string
  sandboxId: string
  stderr: string
  status: string
  stdout: string
  updatedAuthJson: string
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function parseModel(model?: string) {
  const normalized = model?.trim()

  if (!normalized) {
    return undefined
  }

  if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(normalized)) {
    throw new Error("Model contains unsupported characters.")
  }

  return normalized
}

function parseRepoUrl(repoUrl: string) {
  const normalized = repoUrl.trim()

  if (!normalized) {
    throw new Error("repoUrl is required.")
  }

  try {
    const url = new URL(normalized)

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("repoUrl must be an http(s) Git URL.")
    }
  } catch {
    throw new Error("repoUrl must be a valid Git URL.")
  }

  return normalized
}

function parseGitRef(value: string | undefined, label: string) {
  const normalized = value?.trim()

  if (!normalized) {
    return undefined
  }

  if (
    normalized.startsWith("-") ||
    normalized.includes("..") ||
    normalized.includes("//") ||
    !/^[a-zA-Z0-9._/-]{1,120}$/.test(normalized)
  ) {
    throw new Error(`${label} contains unsupported characters.`)
  }

  return normalized
}

function defaultBranchName() {
  return `cloudcode/${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}`
}

async function readLastMessage(sandbox: Sandbox) {
  try {
    return (await sandbox.files.read(LAST_MESSAGE_PATH)).trim()
  } catch {
    return ""
  }
}

function redactAuthPathOutput(result: CommandResult) {
  const exitPattern = new RegExp(`\\n?${EXIT_MARKER}(\\d+)\\s*$`)
  const exitMatch = result.stdout.match(exitPattern)
  const exitCode = exitMatch?.[1] ? Number(exitMatch[1]) : result.exitCode

  return {
    ...result,
    exitCode,
    stderr: result.stderr.replaceAll(CODEX_HOME, "$CODEX_HOME"),
    stdout: result.stdout
      .replace(exitPattern, "")
      .replaceAll(CODEX_HOME, "$CODEX_HOME"),
  }
}

export async function runCodexInSandbox(input: RunCodexInSandboxInput) {
  const model = parseModel(input.model)
  const repoUrl = parseRepoUrl(input.repoUrl)
  const baseBranch = parseGitRef(input.baseBranch, "baseBranch")
  const branchName =
    parseGitRef(input.branchName, "branchName") ?? defaultBranchName()
  const githubToken = input.githubToken?.trim() || process.env.GITHUB_TOKEN
  const timeoutMs = input.timeoutMs ?? 10 * 60 * 1000
  const sandbox = await Sandbox.create("codex", {
    timeoutMs: Math.max(timeoutMs + 60_000, 120_000),
  })

  try {
    await sandbox.commands.run(
      `mkdir -p ${CODEX_HOME} && chmod 700 ${CODEX_HOME}`
    )
    await sandbox.files.write(`${CODEX_HOME}/auth.json`, input.authJson)
    await sandbox.files.write(PROMPT_PATH, input.prompt)
    await sandbox.commands.run(
      `chmod 600 ${CODEX_HOME}/auth.json ${PROMPT_PATH}`
    )

    await sandbox.git.clone(repoUrl, {
      branch: baseBranch,
      depth: 1,
      password: githubToken,
      path: REPO_PATH,
      username: githubToken ? "x-access-token" : undefined,
    })
    await sandbox.git.createBranch(REPO_PATH, branchName)

    const modelFlag = model ? ` --model ${shellQuote(model)}` : ""
    const codexCommand = [
      `CODEX_HOME=${CODEX_HOME}`,
      "codex exec",
      "--full-auto",
      "--skip-git-repo-check",
      "--ignore-user-config",
      "--ignore-rules",
      "--ephemeral",
      "--json",
      modelFlag,
      `--output-last-message ${LAST_MESSAGE_PATH}`,
      `-C ${REPO_PATH}`,
      `- < ${PROMPT_PATH}`,
    ].join(" ")
    const command = shellQuote(
      [
        "set +e",
        codexCommand,
        "code=$?",
        `printf '\\n${EXIT_MARKER}%s\\n' \"$code\"`,
        "exit 0",
      ].join("\n")
    )

    const result = redactAuthPathOutput(
      await sandbox.commands.run(`bash -lc ${command}`, {
        envs: {
          CODEX_HOME,
          HOME: "/home/user",
        },
        timeoutMs,
      })
    )

    return {
      branchName,
      diff: (
        await sandbox.commands.run(`git -C ${REPO_PATH} diff --binary`, {
          timeoutMs: 60_000,
        })
      ).stdout,
      exitCode: result.exitCode,
      lastMessage: await readLastMessage(sandbox),
      repoUrl,
      sandboxId: sandbox.sandboxId,
      stderr: result.stderr,
      status: (
        await sandbox.commands.run(
          `git -C ${REPO_PATH} status --short --branch`,
          {
            timeoutMs: 60_000,
          }
        )
      ).stdout,
      stdout: result.stdout,
      updatedAuthJson: await sandbox.files.read(`${CODEX_HOME}/auth.json`),
    } satisfies RunCodexInSandboxResult
  } finally {
    await sandbox.commands
      .run(
        `rm -f ${CODEX_HOME}/auth.json ${PROMPT_PATH} ${LAST_MESSAGE_PATH}`,
        {
          timeoutMs: 10_000,
        }
      )
      .catch(() => undefined)
    await sandbox.kill().catch(() => undefined)
  }
}
