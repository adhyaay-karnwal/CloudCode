const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export function cleanEnvNameWithMessage(name: string, message: string) {
  const trimmed = name.trim()
  if (!ENV_NAME_RE.test(trimmed)) {
    throw new Error(message)
  }
  return trimmed
}
