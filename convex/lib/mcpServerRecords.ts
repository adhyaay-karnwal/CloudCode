import type { Doc } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"

type McpServerDoc = Doc<"mcpServers">

export async function serverChildren(ctx: QueryCtx, server: McpServerDoc) {
  const [secrets, tools] = await Promise.all([
    ctx.db
      .query("mcpServerSecrets")
      .withIndex("by_server", (q) => q.eq("serverId", server._id))
      .collect(),
    ctx.db
      .query("mcpServerTools")
      .withIndex("by_server", (q) => q.eq("serverId", server._id))
      .collect(),
  ])

  return {
    secrets: secrets
      .map((secret) => ({
        id: secret._id,
        kind: secret.kind,
        name: secret.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    tools: tools
      .map((tool) => ({
        description: tool.description,
        id: tool._id,
        name: tool.name,
        policy: tool.policy,
        title: tool.title,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export async function mcpServerListRow(ctx: QueryCtx, server: McpServerDoc) {
  return {
    args: server.args,
    bearerTokenEnvVar: server.bearerTokenEnvVar,
    command: server.command,
    createdAt: server.createdAt,
    cwd: server.cwd,
    description: server.description,
    enabled: server.enabled,
    envVars: server.envVars,
    id: server._id,
    name: server.name,
    serverName: server.serverName,
    startupTimeoutSec: server.startupTimeoutSec,
    toolTimeoutSec: server.toolTimeoutSec,
    transport: server.transport,
    updatedAt: server.updatedAt,
    url: server.url,
    ...(await serverChildren(ctx, server)),
  }
}
