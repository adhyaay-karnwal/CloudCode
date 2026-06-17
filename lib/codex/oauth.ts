import { createHash, randomBytes } from "node:crypto"

import { saveCodexOAuthTokens } from "@/lib/codex/auth"
import { codexOAuthClientId, codexOAuthIssuer } from "@/lib/codex/oauth-config"
import { decryptSecret, encryptSecret } from "@/lib/security/secret-crypto"

const LOGIN_STATE_VERSION = "web-callback-v1"
const SCOPE =
  "openid profile email offline_access api.connectors.read api.connectors.invoke"

export const CODEX_OAUTH_STATE_COOKIE = "cloudcode_codex_oauth_state"
export const CODEX_OAUTH_STATE_COOKIE_MAX_AGE = 15 * 60
export const CODEX_OAUTH_STATE_COOKIE_PATH = "/api/codex-auth"

type CodexOAuthStateCookie = {
  codeVerifier: string
  createdAt: number
  profile?: string
  redirectUri: string
  returnUrl: string
  state: string
  useAccountProfile?: boolean
  version: typeof LOGIN_STATE_VERSION
}

type CreateCodexLoginRequestInput = {
  appOrigin: string
  forceLogin?: boolean
  profile?: string
  returnUrl?: string
  useAccountProfile?: boolean
}

type CompleteCodexLoginInput = {
  code: string
  convexToken: string
  requestOrigin: string
  returnedState: string
  stateCookie?: string
}

function base64Url(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function createPkcePair() {
  const codeVerifier = base64Url(randomBytes(32))
  const codeChallenge = base64Url(
    createHash("sha256").update(codeVerifier).digest()
  )

  return { codeChallenge, codeVerifier }
}

function createState() {
  return base64Url(randomBytes(32))
}

function buildCallbackUri(appOrigin: string) {
  return new URL("/api/codex-auth/callback", appOrigin).toString()
}

function buildAuthorizeUrl({
  codeChallenge,
  forceLogin,
  redirectUri,
  state,
}: {
  codeChallenge: string
  forceLogin?: boolean
  redirectUri: string
  state: string
}) {
  const issuer = codexOAuthIssuer()
  const url = new URL("/oauth/authorize", issuer)

  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", codexOAuthClientId())
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("scope", SCOPE)
  url.searchParams.set("code_challenge", codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("id_token_add_organizations", "true")
  url.searchParams.set("codex_cli_simplified_flow", "true")
  url.searchParams.set("state", state)
  url.searchParams.set("originator", "codex_cli_rs")
  if (forceLogin) {
    url.searchParams.set("max_age", "0")
  }

  return url.toString()
}

export function codexOAuthErrorMessage(url: URL) {
  const error = url.searchParams.get("error")
  if (!error) return null

  const description = url.searchParams.get("error_description")

  return description
    ? `ChatGPT sign-in failed: ${description}`
    : `ChatGPT sign-in failed: ${error}`
}

async function exchangeCodeForTokens({
  code,
  codeVerifier,
  redirectUri,
}: {
  code: string
  codeVerifier: string
  redirectUri: string
}) {
  const tokenEndpoint = new URL("/oauth/token", codexOAuthIssuer())
  const body = new URLSearchParams({
    client_id: codexOAuthClientId(),
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  })

  const response = await fetch(tokenEndpoint, {
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  })

  if (!response.ok) {
    throw new Error(`Token exchange failed with status ${response.status}.`)
  }

  const data = (await response.json()) as {
    access_token?: unknown
    id_token?: unknown
    refresh_token?: unknown
  }

  if (
    typeof data.access_token !== "string" ||
    typeof data.id_token !== "string" ||
    typeof data.refresh_token !== "string"
  ) {
    throw new Error(
      "Token exchange response did not include all Codex OAuth tokens."
    )
  }

  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function requiredString(
  record: Record<string, unknown>,
  key: keyof CodexOAuthStateCookie
) {
  const value = record[key]
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("ChatGPT sign-in state is malformed.")
  }
  return value
}

function optionalString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

function optionalBoolean(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === "boolean" ? value : undefined
}

function parseStateCookie(value: string): CodexOAuthStateCookie {
  let parsed: unknown

  try {
    parsed = JSON.parse(decryptSecret(value))
  } catch {
    throw new Error("ChatGPT sign-in state could not be read.")
  }

  if (!isRecord(parsed) || parsed.version !== LOGIN_STATE_VERSION) {
    throw new Error("ChatGPT sign-in state is malformed.")
  }

  const createdAt = parsed.createdAt
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) {
    throw new Error("ChatGPT sign-in state is malformed.")
  }

  if (Date.now() - createdAt > CODEX_OAUTH_STATE_COOKIE_MAX_AGE * 1000) {
    throw new Error("ChatGPT sign-in expired. Try again.")
  }

  return {
    codeVerifier: requiredString(parsed, "codeVerifier"),
    createdAt,
    profile: optionalString(parsed, "profile"),
    redirectUri: requiredString(parsed, "redirectUri"),
    returnUrl: requiredString(parsed, "returnUrl"),
    state: requiredString(parsed, "state"),
    useAccountProfile: optionalBoolean(parsed, "useAccountProfile"),
    version: LOGIN_STATE_VERSION,
  }
}

function safeReturnUrl(returnUrl: string, requestOrigin: string) {
  try {
    const url = new URL(returnUrl)
    if (url.origin === requestOrigin) return url.toString()
  } catch {
    // Fall through to the app origin.
  }

  return requestOrigin
}

export function createCodexLoginRequest({
  appOrigin,
  forceLogin,
  profile,
  returnUrl,
  useAccountProfile,
}: CreateCodexLoginRequestInput) {
  const redirectUri = buildCallbackUri(appOrigin)
  const { codeChallenge, codeVerifier } = createPkcePair()
  const state = createState()
  const stateCookie: CodexOAuthStateCookie = {
    codeVerifier,
    createdAt: Date.now(),
    ...(profile !== undefined ? { profile } : {}),
    redirectUri,
    returnUrl: returnUrl ?? appOrigin,
    state,
    ...(useAccountProfile !== undefined ? { useAccountProfile } : {}),
    version: LOGIN_STATE_VERSION,
  }

  return {
    cookieValue: encryptSecret(JSON.stringify(stateCookie)),
    loginUrl: buildAuthorizeUrl({
      codeChallenge,
      forceLogin,
      redirectUri,
      state,
    }),
  }
}

export async function completeCodexLogin({
  code,
  convexToken,
  requestOrigin,
  returnedState,
  stateCookie,
}: CompleteCodexLoginInput) {
  if (!stateCookie) {
    throw new Error("ChatGPT sign-in state cookie is missing. Try again.")
  }

  const login = parseStateCookie(stateCookie)
  if (returnedState !== login.state) {
    throw new Error("ChatGPT sign-in state did not match.")
  }

  const tokens = await exchangeCodeForTokens({
    code,
    codeVerifier: login.codeVerifier,
    redirectUri: login.redirectUri,
  })

  await saveCodexOAuthTokens({
    ...tokens,
    convexToken,
    profile: login.profile,
    useAccountProfile: login.useAccountProfile,
  })

  return {
    returnUrl: safeReturnUrl(login.returnUrl, requestOrigin),
  }
}
