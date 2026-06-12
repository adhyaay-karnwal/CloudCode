import { cleanEnvNameWithMessage } from "./envNameValidation"

const ENCRYPTED_SECRET_PREFIX = "cloudcode:v1:"
const SECRET_NAME_ERROR =
  "Secret names must start with a letter or underscore and contain only letters, numbers, and underscores."

export function cleanName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("Preset name is required.")
  if (trimmed.length > 80) throw new Error("Preset name is too long.")
  return trimmed
}

export function cleanDaytonaSnapshot(snapshot?: string) {
  const trimmed = snapshot?.trim()
  if (!trimmed) return undefined
  if (trimmed.length > 160) throw new Error("Snapshot name is too long.")
  if (!/^[A-Za-z0-9._:/-]+$/.test(trimmed)) {
    throw new Error(
      "Snapshot names can only contain letters, numbers, dots, dashes, underscores, slashes, and colons."
    )
  }
  return trimmed
}

export function slugify(value: string, fallback = "environment") {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)

  return slug || fallback
}

export function repoSlug(repoUrl: string) {
  const cleaned = repoUrl
    .trim()
    .replace(/\.git$/, "")
    .replace(/\/+$/, "")
  const parts = cleaned.split("/")
  return slugify(parts.at(-1) || cleaned, "repo")
}

export function cleanEnvironmentSlug(slug?: string) {
  return slug ? slugify(slug) : undefined
}

export function cleanInstallScript(script?: string) {
  const normalized = script?.replace(/\r\n/g, "\n").trim()
  if (!normalized) return undefined
  if (normalized.length > 20_000) throw new Error("Install script is too long.")
  return normalized
}

export function cleanEnvName(name: string) {
  return cleanEnvNameWithMessage(name, SECRET_NAME_ERROR)
}

export function cleanEncryptedPresetSecretValue(value: string) {
  if (!value) throw new Error("Secret value is required.")
  if (value.length > 20_000) throw new Error("Secret value is too long.")
  if (!value.startsWith(ENCRYPTED_SECRET_PREFIX)) {
    throw new Error("Preset secrets must be saved through the server.")
  }
  return value
}
