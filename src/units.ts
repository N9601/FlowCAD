export type Units = 'mm' | 'in'

const MM_PER_INCH = 25.4
const STORAGE_KEY = 'flowcad.units'

let current: Units = (localStorage.getItem(STORAGE_KEY) as Units | null) === 'in' ? 'in' : 'mm'

const listeners = new Set<() => void>()

/** Fires callback whenever the units preference changes. */
export function onUnitsChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getUnits(): Units {
  return current
}

export function setUnits(next: Units) {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Best-effort persistence.
  }
  for (const fn of listeners) fn()
}

/** "12.34 mm" or "0.486 in", depending on user preference. */
export function formatLength(mm: number, precision = 2): string {
  return current === 'in' ? `${(mm / MM_PER_INCH).toFixed(precision + 1)} in` : `${mm.toFixed(precision)} mm`
}

export function formatArea(mm2: number, precision = 2): string {
  return current === 'in' ? `${(mm2 / (MM_PER_INCH * MM_PER_INCH)).toFixed(precision + 1)} in2` : `${(mm2 / 100).toFixed(precision)} cm2`
}

export function formatVolume(mm3: number, precision = 2): string {
  return current === 'in' ? `${(mm3 / (MM_PER_INCH ** 3)).toFixed(precision + 1)} in3` : `${(mm3 / 1000).toFixed(precision)} cm3`
}
