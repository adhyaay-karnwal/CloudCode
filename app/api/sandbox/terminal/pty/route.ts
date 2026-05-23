import { NextResponse } from "next/server"

import {
  connectDaytonaTerminal,
  detachDaytonaTerminal,
  killDaytonaTerminal,
  resizeDaytonaTerminal,
  sendDaytonaTerminalInput,
  type ConnectedDaytonaTerminal,
} from "@/lib/daytona-terminal-sessions"

export const runtime = "nodejs"
export const maxDuration = 3600

function sse(value: unknown) {
  return `data: ${JSON.stringify(value)}\n\n`
}

function terminalData(data: Uint8Array) {
  return {
    data: Buffer.from(data).toString("base64"),
    type: "data",
  }
}

function numberParam(value: string | null, fallback: number) {
  if (!value) return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sandboxId = searchParams.get("sandboxId")
  const terminalId = searchParams.get("terminalId")
  const cols = numberParam(searchParams.get("cols"), 100)
  const rows = numberParam(searchParams.get("rows"), 30)

  if (!sandboxId || !terminalId) {
    return NextResponse.json(
      { error: "sandboxId and terminalId required" },
      { status: 400 }
    )
  }

  const encoder = new TextEncoder()
  let closed = false
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let terminalConnection: ConnectedDaytonaTerminal | undefined

  const stream = new ReadableStream({
    async start(controller) {
      function enqueue(value: unknown) {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(sse(value)))
        } catch {
          closed = true
        }
      }

      try {
        const connection = await connectDaytonaTerminal({
          cols,
          onData: (data) => {
            enqueue(terminalData(data))
          },
          rows,
          sandboxId,
          terminalId,
        })
        terminalConnection = connection

        if (closed) {
          await detachDaytonaTerminal(
            sandboxId,
            terminalId,
            terminalConnection.subscriber
          )
          return
        }

        for (const data of connection.replay) {
          enqueue(terminalData(data))
        }
        if (closed) {
          await detachDaytonaTerminal(
            sandboxId,
            terminalId,
            terminalConnection.subscriber
          )
          return
        }

        connection.activate()
        enqueue({ type: "ready" })
        heartbeat = setInterval(() => enqueue({ type: "ping" }), 20_000)
      } catch (error) {
        enqueue({
          error:
            error instanceof Error
              ? error.message
              : "Unable to connect Daytona terminal.",
          type: "error",
        })
        closed = true
        controller.close()
      }
    },
    async cancel() {
      closed = true
      if (heartbeat) clearInterval(heartbeat)
      if (terminalConnection) {
        await detachDaytonaTerminal(
          sandboxId,
          terminalId,
          terminalConnection.subscriber
        )
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  })
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: unknown
    cols?: unknown
    data?: unknown
    rows?: unknown
    sandboxId?: unknown
    terminalId?: unknown
  }
  const sandboxId = typeof body.sandboxId === "string" ? body.sandboxId : ""
  const terminalId = typeof body.terminalId === "string" ? body.terminalId : ""

  if (!sandboxId || !terminalId) {
    return NextResponse.json(
      { error: "sandboxId and terminalId required" },
      { status: 400 }
    )
  }

  try {
    if (body.action === "resize") {
      await resizeDaytonaTerminal({
        cols: typeof body.cols === "number" ? body.cols : 100,
        rows: typeof body.rows === "number" ? body.rows : 30,
        sandboxId,
        terminalId,
      })
      return NextResponse.json({ ok: true })
    }

    if (typeof body.data !== "string") {
      return NextResponse.json({ error: "data required" }, { status: 400 })
    }

    await sendDaytonaTerminalInput({
      data: body.data,
      sandboxId,
      terminalId,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Terminal command failed.",
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    sandboxId?: unknown
    terminalId?: unknown
  }
  const sandboxId = typeof body.sandboxId === "string" ? body.sandboxId : ""
  const terminalId = typeof body.terminalId === "string" ? body.terminalId : ""

  if (!sandboxId || !terminalId) {
    return NextResponse.json(
      { error: "sandboxId and terminalId required" },
      { status: 400 }
    )
  }

  await killDaytonaTerminal(sandboxId, terminalId)
  return NextResponse.json({ ok: true })
}
