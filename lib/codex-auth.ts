import { createHash } from "node:crypto"

import { Redis } from "@upstash/redis"

const DEFAULT_PROFILE = "default"
const KEY_PREFIX = "cloudcode:codex-auth"

type StoredAuth = {
  authJson: string
  fingerprint: string
  profile: string
  updatedAt: string
}

export type AuthStatus = {
  exists: boolean
  fingerprint?: string
  profile: string
  updatedAt?: string
}

let redis: Redis | null = null

function getRedis() {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (!url || !token) {
      throw new Error(
        "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN before using Codex OAuth storage."
      )
    }

    redis = new Redis({ token, url })
  }

  return redis
}

export function normalizeProfile(profile?: string) {
  const normalized = profile?.trim() || DEFAULT_PROFILE

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(normalized)) {
    throw new Error(
      "Profile must use only letters, numbers, underscores, or hyphens."
    )
  }

  return normalized
}

function getAuthKey(profile: string) {
  return `${KEY_PREFIX}:${profile}`
}

function validateCodexOAuthAuthJson(authJson: string) {
  let parsed: unknown

  try {
    parsed = JSON.parse(authJson)
  } catch {
    throw new Error("auth.json must be valid JSON.")
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("auth.json must be a JSON object.")
  }

  const record = parsed as Record<string, unknown>
  const tokens = record.tokens

  if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) {
    throw new Error(
      "This runner expects Codex ChatGPT OAuth tokens in auth.json."
    )
  }

  const tokenRecord = tokens as Record<string, unknown>

  if (
    typeof tokenRecord.access_token !== "string" ||
    typeof tokenRecord.refresh_token !== "string"
  ) {
    throw new Error(
      "auth.json tokens must include access_token and refresh_token strings."
    )
  }

  if (record.auth_mode && record.auth_mode !== "chatgpt") {
    throw new Error(
      'auth.json auth_mode must be "chatgpt" for OAuth-based Codex runs.'
    )
  }
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16)
}

export async function saveCodexAuthJson(
  profileInput: string | undefined,
  authJson: string
) {
  const profile = normalizeProfile(profileInput)
  validateCodexOAuthAuthJson(authJson)

  const stored: StoredAuth = {
    authJson,
    fingerprint: fingerprint(authJson),
    profile,
    updatedAt: new Date().toISOString(),
  }

  await getRedis().set(getAuthKey(profile), stored)

  return {
    exists: true,
    fingerprint: stored.fingerprint,
    profile,
    updatedAt: stored.updatedAt,
  } satisfies AuthStatus
}

export async function getCodexAuthJson(profileInput?: string) {
  const profile = normalizeProfile(profileInput)
  const stored = await getRedis().get<StoredAuth>(getAuthKey(profile))

  if (!stored?.authJson) {
    throw new Error(
      `No Codex OAuth auth.json is stored for profile "${profile}".`
    )
  }

  return stored.authJson
}

export async function getCodexAuthStatus(profileInput?: string) {
  const profile = normalizeProfile(profileInput)
  const stored = await getRedis().get<StoredAuth>(getAuthKey(profile))

  if (!stored?.authJson) {
    return { exists: false, profile } satisfies AuthStatus
  }

  return {
    exists: true,
    fingerprint: stored.fingerprint,
    profile,
    updatedAt: stored.updatedAt,
  } satisfies AuthStatus
}
