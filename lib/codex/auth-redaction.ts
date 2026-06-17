const REDACTED_AUTH_JSON = "[redacted auth.json]"
const REDACTED_TOKEN = "[redacted token]"

export function redactCodexAuthPayloads(value: string) {
  return value
    .replace(
      /("(?:authJson|updatedAuthJson)"\s*:\s*)"(?:\\.|[^"\\])*"/g,
      `$1"${REDACTED_AUTH_JSON}"`
    )
    .replace(
      /("(?:access_token|id_token|refresh_token)"\s*:\s*)"(?:\\.|[^"\\])*"/g,
      `$1"${REDACTED_TOKEN}"`
    )
    .replace(/\brt_[A-Za-z0-9._-]+\b/g, REDACTED_TOKEN)
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      REDACTED_TOKEN
    )
}
