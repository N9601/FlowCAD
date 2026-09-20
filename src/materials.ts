/** Preset materials with density in g/cm^3 and PBR shading hints. */
export interface MaterialPreset {
  name: string
  density: number
  /** 0 = mirror-smooth, 1 = fully rough. */
  roughness: number
  /** 0 = plastic/dielectric, 1 = raw metal. */
  metalness: number
  /** RGB tint multiplied over the picked colour so metals warm up etc.; undefined = no tint. */
  tint?: number
  /** 0..1; below 1 makes the object translucent. */
  opacity?: number
}

export const MATERIALS: MaterialPreset[] = [
  { name: 'PLA', density: 1.24, roughness: 0.55, metalness: 0.05 },
  { name: 'PETG', density: 1.27, roughness: 0.35, metalness: 0.05 },
  { name: 'ABS', density: 1.04, roughness: 0.65, metalness: 0.05 },
  { name: 'Nylon', density: 1.13, roughness: 0.6, metalness: 0.05 },
  { name: 'Resin', density: 1.15, roughness: 0.25, metalness: 0.1 },
  { name: 'Wood', density: 0.7, roughness: 0.9, metalness: 0.0 },
  { name: 'Aluminum', density: 2.7, roughness: 0.35, metalness: 0.9, tint: 0xd8dce0 },
  { name: 'Steel', density: 7.85, roughness: 0.3, metalness: 0.95, tint: 0xbcc2c8 },
  { name: 'Brass', density: 8.5, roughness: 0.3, metalness: 0.9, tint: 0xd4a24a },
  { name: 'Copper', density: 8.96, roughness: 0.32, metalness: 0.9, tint: 0xd08060 },
  { name: 'Titanium', density: 4.51, roughness: 0.4, metalness: 0.85, tint: 0xa8adb5 },
  { name: 'Glass', density: 2.5, roughness: 0.05, metalness: 0.0, opacity: 0.35 },
]

export const DEFAULT_MATERIAL = 'PLA'

const byName = new Map(MATERIALS.map((m) => [m.name, m]))

export function presetOf(name: string | undefined): MaterialPreset {
  return byName.get(name ?? DEFAULT_MATERIAL) ?? MATERIALS[0]
}

export function densityOf(name: string | undefined): number {
  return presetOf(name).density
}

/** Grams from volume in mm^3 and material name (falls back to PLA). */
export function gramsOf(volumeMm3: number, material: string | undefined): number {
  return (volumeMm3 / 1000) * densityOf(material)
}
