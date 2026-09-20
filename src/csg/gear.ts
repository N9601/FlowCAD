const FLANK_STEPS = 10

export interface GearProfileSpec {
  module: number
  teeth: number
  pressureAngle: number
}

/**
 * Outline of an external involute spur gear as a CCW polygon.
 * Standard proportions: addendum = 1 module, dedendum = 1.25 module.
 */
export function gearProfile({ module, teeth, pressureAngle }: GearProfileSpec): [number, number][] {
  const alpha = (pressureAngle * Math.PI) / 180
  const pitchR = (module * teeth) / 2
  const baseR = pitchR * Math.cos(alpha)
  const rootR = pitchR - 1.25 * module
  const involute = (phi: number) => Math.tan(phi) - phi
  const halfToothAtBase = Math.PI / (2 * teeth) + involute(alpha)

  /** Half angular tooth thickness at radius r (r >= baseR). */
  const halfAngle = (r: number) => halfToothAtBase - involute(Math.acos(baseR / r))

  // Stop the flank before the two sides cross, which happens on low tooth counts.
  let tipR = pitchR + module
  while (halfAngle(tipR) < 0.002 && tipR > pitchR) tipR -= module * 0.01

  const flankStartR = Math.max(baseR, rootR)
  const flank: { r: number; a: number }[] = []
  for (let i = 0; i <= FLANK_STEPS; i++) {
    const r = flankStartR + ((tipR - flankStartR) * i) / FLANK_STEPS
    flank.push({ r, a: halfAngle(r) })
  }

  const points: [number, number][] = []
  const polar = (r: number, a: number) => points.push([r * Math.cos(a), r * Math.sin(a)])
  const pitchAngle = (2 * Math.PI) / teeth

  for (let t = 0; t < teeth; t++) {
    const centre = t * pitchAngle
    if (rootR < baseR) polar(rootR, centre - flank[0].a)
    for (const { r, a } of flank) polar(r, centre - a)
    for (const { r, a } of [...flank].reverse()) polar(r, centre + a)
    if (rootR < baseR) polar(rootR, centre + flank[0].a)
    polar(rootR, centre + pitchAngle / 2)
  }
  return points
}
