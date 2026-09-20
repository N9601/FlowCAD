import type { Manifold, ManifoldToplevel, Mat4 } from 'manifold-3d'

const AXIS_UP: [number, number, number] = [0, 0, 1]

/** Parses "x,y,z x,y,z ..." into a list of points; separators are whitespace or semicolons. */
export function parsePath(text: string): [number, number, number][] {
  const points = text
    .trim()
    .split(/[\s;]+/)
    .filter(Boolean)
    .map((triple): [number, number, number] => {
      const parts = triple.split(',').map(Number)
      if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
        throw new Error(`"${triple}" is not a valid xyz point`)
      }
      return [parts[0], parts[1], parts[2]]
    })
  if (points.length < 2) throw new Error('A path needs at least two points')
  return points
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function normalize(v: [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

/** Aims the local +Z axis at `direction`; returns a 4x4 column-major matrix. */
function orientAlong(direction: [number, number, number]): Mat4 {
  const z = normalize(direction)
  const helper: [number, number, number] = Math.abs(z[2]) < 0.99 ? AXIS_UP : [1, 0, 0]
  const x = normalize(cross(helper, z))
  const y = cross(z, x)
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1] as unknown as Mat4
}

/** Solid pipe of `radius` swept along a polyline. Ball joints at each interior point smooth the seams. */
export function pipe(wasm: ManifoldToplevel, points: readonly [number, number, number][], radius: number, segments: number): Manifold {
  const pieces: Manifold[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay, az] = points[i]
    const [bx, by, bz] = points[i + 1]
    const direction: [number, number, number] = [bx - ax, by - ay, bz - az]
    const length = Math.hypot(...direction)
    if (length < 1e-6) continue
    const midpoint: [number, number, number] = [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2]
    const segment = wasm.Manifold.cylinder(length, radius, radius, segments, true)
    const oriented = segment.transform(orientAlong(direction))
    const placed = oriented.translate(midpoint)
    segment.delete()
    oriented.delete()
    pieces.push(placed)
  }
  // Balls at the interior joints hide the corner gap between two cylinders that meet at an angle.
  for (let i = 1; i < points.length - 1; i++) {
    const ball = wasm.Manifold.sphere(radius, segments)
    pieces.push(ball.translate(points[i]))
    ball.delete()
  }
  if (pieces.length === 0) throw new Error('Pipe path is too short')
  const united = wasm.Manifold.union(pieces)
  for (const piece of pieces) piece.delete()
  return united
}

/** Helical spring. `turns` may be fractional; the axis is +Z with `pitch` mm rise per turn. */
export function spring(wasm: ManifoldToplevel, coilRadius: number, wireRadius: number, pitch: number, turns: number, segments: number): Manifold {
  if (coilRadius <= wireRadius) throw new Error('Coil radius must be greater than wire radius')
  const perTurn = Math.max(24, Math.round(segments * 2))
  const totalSteps = Math.max(perTurn, Math.round(perTurn * Math.abs(turns)))
  const points: [number, number, number][] = []
  for (let i = 0; i <= totalSteps; i++) {
    const t = (i / totalSteps) * turns
    const angle = t * 2 * Math.PI
    points.push([Math.cos(angle) * coilRadius, Math.sin(angle) * coilRadius, t * pitch])
  }
  return pipe(wasm, points, wireRadius, segments)
}
