import { Sandbox } from "e2b"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(request: Request) {
  let sandboxId: string | undefined
  try {
    const body = (await request.json()) as { sandboxId?: unknown }
    if (typeof body.sandboxId === "string") sandboxId = body.sandboxId
  } catch {
    // ignore
  }

  if (!sandboxId) {
    return NextResponse.json({ error: "sandboxId required" }, { status: 400 })
  }

  try {
    const killed = await Sandbox.kill(sandboxId)
    return NextResponse.json({ killed })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to kill sandbox",
      },
      { status: 500 }
    )
  }
}
