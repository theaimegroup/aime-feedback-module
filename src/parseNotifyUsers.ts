import type { NotifyUser } from './types'

/**
 * Defensively parse the `notifyUsers` value into a clean `NotifyUser[]`.
 *
 * Generated/host apps frequently feed this straight from an env var
 * (`VITE_FEEDBACK_NOTIFY_USERS` / `NEXT_PUBLIC_FEEDBACK_NOTIFY_USERS`), and that
 * value can arrive in several shapes depending on how the deployment pipeline
 * escaped it:
 *   - an already-parsed `NotifyUser[]`
 *   - a JSON string: `[{"id":"1","name":"Bob"}]`
 *   - a base64-encoded JSON string (the current, escaping-safe transport)
 *   - a double-escaped string from dotenv: `[{\"id\":\"1\",\"name\":\"Bob\"}]`
 *   - a value wrapped in stray quotes: `"[...]"`
 *
 * Whatever comes in, this NEVER throws — on anything unparseable it returns an
 * empty array, so a malformed env var can't crash the host app (the bug this
 * was written to kill).
 */

function isNotifyUser(v: unknown): v is NotifyUser {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as Record<string, unknown>).id === 'string' &&
    typeof (v as Record<string, unknown>).name === 'string'
  )
}

function coerceArray(parsed: unknown): NotifyUser[] | null {
  return Array.isArray(parsed) ? parsed.filter(isNotifyUser) : null
}

function tryJson(s: string): NotifyUser[] | null {
  try {
    let parsed: unknown = JSON.parse(s)
    // Handle a doubly-encoded string, e.g. JSON.stringify(JSON.stringify(arr)).
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    return coerceArray(parsed)
  } catch {
    return null
  }
}

function base64Decode(s: string): string | null {
  try {
    if (typeof atob === 'function') {
      const bin = atob(s)
      // UTF-8 safe decode for names with non-ASCII characters.
      if (typeof TextDecoder !== 'undefined') {
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
        return new TextDecoder().decode(bytes)
      }
      return bin
    }
    // Node / SSR fallback.
    const B = (globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } }).Buffer
    if (B) return B.from(s, 'base64').toString('utf-8')
  } catch {
    /* fall through */
  }
  return null
}

export function parseNotifyUsers(input: unknown): NotifyUser[] {
  if (input == null) return []
  if (Array.isArray(input)) return input.filter(isNotifyUser)
  if (typeof input !== 'string') return []

  const raw = input.trim()
  if (!raw || raw === '[]') return []

  // Try the value as JSON in a few progressively-cleaned forms.
  const candidates = [
    raw,
    raw.replace(/\\"/g, '"'), // un-escape dotenv double-escaped quotes
    raw.replace(/^['"]+|['"]+$/g, ''), // strip stray wrapping quotes
    raw.replace(/^['"]+|['"]+$/g, '').replace(/\\"/g, '"'),
  ]
  for (const candidate of candidates) {
    const result = tryJson(candidate)
    if (result) return result
  }

  // Otherwise treat it as base64-encoded JSON (the escaping-safe transport).
  const decoded = base64Decode(raw)
  if (decoded) {
    const result = tryJson(decoded)
    if (result) return result
  }

  if (typeof console !== 'undefined') {
    console.warn('[aime-feedback] Ignoring unparseable notifyUsers value:', input)
  }
  return []
}
