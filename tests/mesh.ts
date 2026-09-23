import type { SolidData } from '../src/csg/protocol'

/** Unit cube from (0, 0, 0) to (1, 1, 1) with every triangle wound to face outward. */
export function unitCube(): SolidData {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]),
    indices: new Uint32Array([
      0, 2, 1, 0, 3, 2, // bottom
      4, 5, 6, 4, 6, 7, // top
      0, 1, 5, 0, 5, 4, // front
      3, 7, 6, 3, 6, 2, // back
      0, 4, 7, 0, 7, 3, // left
      1, 2, 6, 1, 6, 5, // right
    ]),
  }
}

/** Signed volume of an indexed mesh; positive when the triangles face outward. */
export function signedVolume({ positions, indices }: SolidData): number {
  let volume = 0
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3]
    const [ax, ay, az] = [positions[a], positions[a + 1], positions[a + 2]]
    const [bx, by, bz] = [positions[b], positions[b + 1], positions[b + 2]]
    const [cx, cy, cz] = [positions[c], positions[c + 1], positions[c + 2]]
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return volume
}

/** Axis-aligned bounds of a mesh as [min, max] xyz triples. */
export function bounds({ positions }: SolidData): [number[], number[]] {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k])
      max[k] = Math.max(max[k], positions[i + k])
    }
  }
  return [min, max]
}
