import type { Manifold, ManifoldToplevel, Vec3 } from 'manifold-3d'

const GROOVE_HALF_ANGLE = (19 * Math.PI) / 180 // standard 38 degree V-belt groove

/** Frees the inputs of a one-shot operation. */
function consume<T extends { delete(): void }>(inputs: T[], result: Manifold): Manifold {
  for (const input of inputs) input.delete()
  return result
}

/** Regular prism (or pyramid when topRadius is 0), turned so a flat side faces the Y axis. */
export function polygonSolid(wasm: ManifoldToplevel, sides: number, radius: number, topRadius: number, height: number): Manifold {
  const raw = wasm.Manifold.cylinder(height, radius, topRadius, sides, true)
  return consume([raw], raw.rotate([0, 0, 180 / sides]))
}

/** Right-angle wedge: x by y footprint, rising to height z along the x = 0 edge. */
export function wedge(wasm: ManifoldToplevel, x: number, y: number, z: number): Manifold {
  const side = wasm.Manifold.extrude([[0, 0], [x, 0], [0, z]], y)
  return consume([side], side.rotate([90, 0, 0]))
}

export function roundedBox(wasm: ManifoldToplevel, size: Vec3, radius: number, segments: number): Manifold {
  const corner = wasm.Manifold.sphere(radius, segments)
  const corners: Manifold[] = []
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push(corner.translate([sx * (size[0] / 2 - radius), sy * (size[1] / 2 - radius), sz * (size[2] / 2 - radius)]))
      }
    }
  }
  return consume([corner, ...corners], wasm.Manifold.hull(corners))
}

export function dome(wasm: ManifoldToplevel, radius: number, segments: number): Manifold {
  const ball = wasm.Manifold.sphere(radius, segments)
  return consume([ball], ball.trimByPlane([0, 0, 1], 0))
}

/** Cylinder with hemispherical ends; `length` is the overall length along Z. */
export function capsule(wasm: ManifoldToplevel, radius: number, length: number, segments: number): Manifold {
  const ball = wasm.Manifold.sphere(radius, segments)
  const ends = [-1, 1].map((s) => ball.translate([0, 0, s * (length / 2 - radius)]))
  return consume([ball, ...ends], wasm.Manifold.hull(ends))
}

/** Opening width of the V groove at the rim, shared with the panel's validation. */
export function grooveOpening(width: number, grooveDepth: number): number {
  return Math.max(0.5, width * 0.1) + 2 * grooveDepth * Math.tan(GROOVE_HALF_ANGLE)
}

export function pulley(wasm: ManifoldToplevel, diameter: number, width: number, grooveDepth: number, bore: number): Manifold {
  const outer = diameter / 2
  const flange = (width - grooveOpening(width, grooveDepth)) / 2
  const slope = grooveDepth * Math.tan(GROOVE_HALF_ANGLE)
  return wasm.Manifold.revolve(
    [
      [bore / 2, 0],
      [outer, 0],
      [outer, flange],
      [outer - grooveDepth, flange + slope],
      [outer - grooveDepth, width - flange - slope],
      [outer, width - flange],
      [outer, width],
      [bore / 2, width],
    ],
    96,
  )
}
