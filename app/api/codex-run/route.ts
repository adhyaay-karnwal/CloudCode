import { NextResponse } from "next/server"

import { getCodexAuthJson, saveCodexAuthJson } from "@/lib/codex-auth"
import {
  type CodexSpeed,
  type ReasoningEffort,
  runCodexInSandbox,
} from "@/lib/e2b-codex-agent"

export const runtime = "nodejs"
export const maxDuration = 300

function parseReasoningEffort(value: unknown): ReasoningEffort | undefined {
  if (
    value === "none" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
  ) {
    return value
  }

  return undefined
}

function parseSpeed(value: unknown): CodexSpeed | undefined {
  if (value === "standard" || value === "fast") {
    return value
  }

  return undefined
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      baseBranch?: unknown
      branchName?: unknown
      githubToken?: unknown
      model?: unknown
      profile?: unknown
      prompt?: unknown
      reasoningEffort?: unknown
      repoUrl?: unknown
      sandboxId?: unknown
      speed?: unknown
      timeoutMs?: unknown
    }

    if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "prompt is required." },
        { status: 400 }
      )
    }

    if (typeof body.repoUrl !== "string" || body.repoUrl.trim().length === 0) {
      return NextResponse.json(
        { error: "repoUrl is required." },
        { status: 400 }
      )
    }

    const profile = typeof body.profile === "string" ? body.profile : undefined
    const authJson = await getCodexAuthJson(profile)

    const result = await runCodexInSandbox({
      authJson,
      baseBranch:
        typeof body.baseBranch === "string" ? body.baseBranch : undefined,
      branchName:
        typeof body.branchName === "string" ? body.branchName : undefined,
      githubToken:
        typeof body.githubToken === "string" ? body.githubToken : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
      prompt: body.prompt,
      reasoningEffort: parseReasoningEffort(body.reasoningEffort),
      repoUrl: body.repoUrl,
      sandboxId:
        typeof body.sandboxId === "string" ? body.sandboxId : undefined,
      speed: parseSpeed(body.speed),
      timeoutMs:
        typeof body.timeoutMs === "number" ? body.timeoutMs : undefined,
    })
    const { updatedAuthJson, ...responseBody } = result

    if (updatedAuthJson !== authJson) {
      await saveCodexAuthJson(profile, updatedAuthJson)
    }

    return NextResponse.json(responseBody, {
      status: result.exitCode === 0 ? 200 : 500,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Codex sandbox run failed.",
      },
      { status: 500 }
    )
  }
}
