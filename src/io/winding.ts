import { Matrix4 } from 'three'
import type { PlacedSolid } from '../csg/protocol'

/**
 * Triangle indices that stay outward-facing once the part's matrix is applied. A mirrored
 * placement (negative determinant) turns triangles inside out, so their winding is swapped back.
 */
export function outwardIndices(part: PlacedSolid): Uint32Array {
  if (new Matrix4().fromArray(part.matrix).determinant() >= 0) return part.solid.indices
  const flipped = part.solid.indices.slice()
  for (let t = 0; t < flipped.length; t += 3) {
    const swap = flipped[t + 1]
    flipped[t + 1] = flipped[t + 2]
    flipped[t + 2] = swap
  }
  return flipped
}
