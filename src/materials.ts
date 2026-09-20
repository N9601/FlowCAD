/** Preset materials with density in g/cm^3. */
export interface MaterialPreset {
  name: string
  density: number
}

export const MATERIALS: MaterialPreset[] = [
  { name: 'PLA', density: 1.24 },
  { name: 'PETG', density: 1.27 },
  { name: 'ABS', density: 1.04 },
  { name: 'Nylon', density: 1.13 },
  { name: 'Resin', density: 1.15 },
  { name: 'Wood', density: 0.7 },
  { name: 'Aluminum', density: 2.7 },
  { name: 'Steel', density: 7.85 },
  { name: 'Brass', density: 8.5 },
  { name: 'Copper', density: 8.96 },
  { name: 'Titanium', density: 4.51 },
  { name: 'Glass', density: 2.5 },
]

export const DEFAULT_MATERIAL = 'PLA'

const byName = new Map(MATERIALS.map((m) => [m.name, m]))

export function densityOf(name: string | undefined): number {
  return byName.get(name ?? DEFAULT_MATERIAL)?.density ?? 1.24
}

/** Grams from volume in mm^3 and material name (falls back to PLA). */
export function gramsOf(volumeMm3: number, material: string | undefined): number {
  return (volumeMm3 / 1000) * densityOf(material)
}
