import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import { metricSize, type MetricSize } from './iso'

const STEPS_PER_TURN = 32
const THREAD_DEPTH = 0.54127 // 5/8 of the fundamental triangle height, in pitches
const ROOT_FLAT = 1 / 4
const CREST_FLAT = 1 / 8
const FLANK = (1 - ROOT_FLAT - CREST_FLAT) / 2

/** ISO 68-1 basic profile: radial height (0..1) at a phase (0..1) along one pitch. */
function profileHeight(phase: number): number {
  if (phase < ROOT_FLAT) return 0
  if (phase < ROOT_FLAT + FLANK) return (phase - ROOT_FLAT) / FLANK
  if (phase < ROOT_FLAT + FLANK + CREST_FLAT) return 1
  return (1 - phase) / FLANK
}

/**
 * Right-hand external thread from z = 0 to z = length. Twisting the cross-section one turn per
 * pitch turns the angular profile into the same profile along the axis.
 */
function threadedRod(wasm: ManifoldToplevel, size: MetricSize, length: number, radialOffset = 0): Manifold {
  const minorR = size.d / 2 - THREAD_DEPTH * size.pitch + radialOffset
  const depth = THREAD_DEPTH * size.pitch
  const section: [number, number][] = []
  for (let i = 0; i < STEPS_PER_TURN; i++) {
    const phase = i / STEPS_PER_TURN
    const r = minorR + depth * profileHeight(phase)
    section.push([r * Math.cos(phase * 2 * Math.PI), r * Math.sin(phase * 2 * Math.PI)])
  }
  const turns = length / size.pitch
  return wasm.Manifold.extrude(section, length, Math.ceil(turns * STEPS_PER_TURN), turns * 360, [1, 1], false)
}

/** Solid of revolution from an (r, z) outline listed counter-clockwise. */
function lathe(wasm: ManifoldToplevel, outline: [number, number][]): Manifold {
  return wasm.Manifold.revolve(outline, 96)
}

function intersectAndFree(a: Manifold, b: Manifold): Manifold {
  const result = a.intersect(b)
  a.delete()
  b.delete()
  return result
}

/** Hex prism from z = 0 to z = height with 30 degree chamfers on the listed faces. */
function hexPrism(wasm: ManifoldToplevel, acrossFlats: number, height: number, chamferBottom: boolean): Manifold {
  const cornerR = acrossFlats / Math.sqrt(3)
  const flatR = acrossFlats * 0.475
  const drop = (cornerR - flatR) * Math.tan(Math.PI / 6)
  const hex = wasm.Manifold.cylinder(height, cornerR, cornerR, 6, false)
  const outline: [number, number][] = chamferBottom
    ? [[0, 0], [flatR, 0], [cornerR, drop], [cornerR, height - drop], [flatR, height], [0, height]]
    : [[0, 0], [cornerR, 0], [cornerR, height - drop], [flatR, height], [0, height]]
  return intersectAndFree(hex, lathe(wasm, outline))
}

export function rod(wasm: ManifoldToplevel, d: number, length: number): Manifold {
  const size = metricSize(d)
  const majorR = d / 2
  const lead = THREAD_DEPTH * size.pitch
  const outline: [number, number][] = [
    [0, 0], [majorR - lead, 0], [majorR, lead], [majorR, length - lead], [majorR - lead, length], [0, length],
  ]
  return intersectAndFree(threadedRod(wasm, size, length), lathe(wasm, outline))
}

/** Hex bolt: head sits on z = 0, threaded shank points up. `length` is the shank length. */
export function bolt(wasm: ManifoldToplevel, d: number, length: number): Manifold {
  const size = metricSize(d)
  const majorR = d / 2
  const lead = THREAD_DEPTH * size.pitch
  // The shank starts slightly inside the head so the union has volume to merge.
  const overlap = size.headHeight / 2
  const total = length + overlap
  const outline: [number, number][] = [[0, 0], [majorR, 0], [majorR, total - lead], [majorR - lead, total], [0, total]]
  const shank = intersectAndFree(threadedRod(wasm, size, total), lathe(wasm, outline))
  const raised = shank.translate([0, 0, size.headHeight - overlap])
  // Head is flipped so its chamfered face ends up on the outside (bottom).
  const head = hexPrism(wasm, size.acrossFlats, size.headHeight, false)
  const mirrored = head.mirror([0, 0, 1])
  const flipped = mirrored.translate([0, 0, size.headHeight])
  const result = wasm.Manifold.union(flipped, raised)
  for (const m of [shank, raised, head, mirrored, flipped]) m.delete()
  return result
}

/** Hex nut. `clearance` widens the tapped hole radially so printed parts actually screw together. */
export function nut(wasm: ManifoldToplevel, d: number, clearance: number): Manifold {
  const size = metricSize(d)
  const body = hexPrism(wasm, size.acrossFlats, size.nutHeight, true)
  const cutter = threadedRod(wasm, size, size.nutHeight + 2 * size.pitch, clearance)
  const placed = cutter.translate([0, 0, -size.pitch])
  const result = body.subtract(placed)
  for (const m of [body, cutter, placed]) m.delete()
  return result
}
