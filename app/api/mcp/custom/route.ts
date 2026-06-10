import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { getConvexAuthToken } from "@/lib/codex-auth"
import { requireSameOrigin } from "@/lib/request-security"
import { encryptSecret } from "@/lib/secret-crypto"

export const runtime = "nodejs"

type KeyValue = {
  name: string
  value: string
}

function getConvexUrl() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) {
    throw new Error("Set NEXT_PUBLIC_CONVEX_URL before using Convex storage.")
  }
  return url
}

async function convexClient() {
  const client = new ConvexHttpClient(getConvexUrl())
  client.setAuth(await getConvexAuthToken())
  return client
}

function encryptedPairs(value: unknown) {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as KeyValue).name !== "string" ||
      typeof (item as KeyValue).value !== "string"
    ) {
      return []
    }
    const name = (item as KeyValue).name.trim()
    const rawValue = (item as KeyValue).value
    return name && rawValue ? [{ name, value: encryptSecret(rawValue) }] : []
  })
}

export async function POST(request: Request) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  try {
    const body = (await request.json()) as Record<string, unknown>
    const client = await convexClient()
    const serverId = await client.mutation(api.mcpServers.saveCustom, {
      args: Array.isArray(body.args)
        ? body.args.filter((arg): arg is string => typeof arg === "string")
        : undefined,
      bearerTokenEnvVar:
        typeof body.bearerTokenEnvVar === "string"
          ? body.bearerTokenEnvVar
          : undefined,
      command: typeof body.command === "string" ? body.command : undefined,
      cwd: typeof body.cwd === "string" ? body.cwd : undefined,
      envHttpHeaders: encryptedPairs(body.envHttpHeaders),
      envVars: Array.isArray(body.envVars)
        ? body.envVars.filter(
            (name): name is string => typeof name === "string"
          )
        : undefined,
      httpHeaders: encryptedPairs(body.httpHeaders),
      name: typeof body.name === "string" ? body.name : "",
      secrets: encryptedPairs(body.secrets),
      serverId:
        typeof body.serverId === "string"
          ? (body.serverId as Id<"mcpServers">)
          : undefined,
      startupTimeoutSec:
        typeof body.startupTimeoutSec === "number"
          ? body.startupTimeoutSec
          : undefined,
      toolTimeoutSec:
        typeof body.toolTimeoutSec === "number"
          ? body.toolTimeoutSec
          : undefined,
      tools: Array.isArray(body.tools) ? body.tools : undefined,
      transport: body.transport === "http" ? "http" : "stdio",
      url: typeof body.url === "string" ? body.url : undefined,
    })

    return NextResponse.json({ serverId })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save MCP server.",
      },
      { status: 400 }
    )
  }
}

export async function PATCH(request: Request) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  try {
    const body = (await request.json()) as Record<string, unknown>
    if (typeof body.serverId !== "string") {
      return NextResponse.json(
        { error: "MCP server id is required." },
        { status: 400 }
      )
    }

    const client = await convexClient()
    const serverId = await client.mutation(api.mcpServers.updateCustom, {
      args: Array.isArray(body.args)
        ? body.args.filter((arg): arg is string => typeof arg === "string")
        : undefined,
      bearerTokenEnvVar:
        typeof body.bearerTokenEnvVar === "string"
          ? body.bearerTokenEnvVar
          : undefined,
      command: typeof body.command === "string" ? body.command : undefined,
      cwd: typeof body.cwd === "string" ? body.cwd : undefined,
      envHttpHeaders: encryptedPairs(body.envHttpHeaders),
      envVars: Array.isArray(body.envVars)
        ? body.envVars.filter(
            (name): name is string => typeof name === "string"
          )
        : undefined,
      httpHeaders: encryptedPairs(body.httpHeaders),
      name: typeof body.name === "string" ? body.name : "",
      removeSecretIds: Array.isArray(body.removeSecretIds)
        ? (body.removeSecretIds.filter(
            (id): id is string => typeof id === "string"
          ) as Id<"mcpServerSecrets">[])
        : undefined,
      secrets: encryptedPairs(body.secrets),
      serverId: body.serverId as Id<"mcpServers">,
      transport: body.transport === "http" ? "http" : "stdio",
      url: typeof body.url === "string" ? body.url : undefined,
    })

    return NextResponse.json({ serverId })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save MCP server.",
      },
      { status: 400 }
    )
  }
}

export async function GET(request: Request) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  try {
    const client = await convexClient()
    const servers = await client.query(api.mcpServers.list, {})

    return NextResponse.json({ servers })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load MCP servers.",
        servers: [],
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const blocked = requireSameOrigin(request)
  if (blocked) return blocked

  try {
    const body = (await request.json()) as Record<string, unknown>
    if (typeof body.serverId !== "string") {
      return NextResponse.json(
        { error: "MCP server id is required." },
        { status: 400 }
      )
    }

    const client = await convexClient()
    await client.mutation(api.mcpServers.remove, {
      serverId: body.serverId as Id<"mcpServers">,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to remove MCP server.",
      },
      { status: 400 }
    )
  }
}
