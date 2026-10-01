/**
 * localStorage access for UI preferences. Storage can be unavailable (site data blocked, some
 * private modes) or full, and a preference is never worth breaking the app over.
 */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Best-effort persistence.
  }
}
