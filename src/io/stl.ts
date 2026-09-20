import * as THREE from 'three'
import type { PlacedSolid } from '../csg/protocol'

const HEADER_BYTES = 80
const TRIANGLE_BYTES = 50

export function encodeBinaryStl(parts: readonly PlacedSolid[]): ArrayBuffer {
  const triangles = parts.reduce((n, p) => n + p.solid.indices.length / 3, 0)
  const buffer = new ArrayBuffer(HEADER_BYTES + 4 + triangles * TRIANGLE_BYTES)
  const out = new DataView(buffer)
  new TextEncoder().encodeInto('FlowCAD binary STL', new Uint8Array(buffer, 0, HEADER_BYTES))
  out.setUint32(HEADER_BYTES, triangles, true)

  const matrix = new THREE.Matrix4()
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const normal = new THREE.Vector3()
  const edge = new THREE.Vector3()
  let offset = HEADER_BYTES + 4

  for (const { solid, matrix: elements } of parts) {
    matrix.fromArray(elements)
    for (let t = 0; t < solid.indices.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        v[k].fromArray(solid.positions, solid.indices[t + k] * 3).applyMatrix4(matrix)
      }
      normal.subVectors(v[1], v[0]).cross(edge.subVectors(v[2], v[0])).normalize()
      for (const vec of [normal, ...v]) {
        out.setFloat32(offset, vec.x, true)
        out.setFloat32(offset + 4, vec.y, true)
        out.setFloat32(offset + 8, vec.z, true)
        offset += 12
      }
      offset += 2
    }
  }
  return buffer
}

export function download(data: ArrayBuffer, filename: string) {
  const url = URL.createObjectURL(new Blob([data], { type: 'model/stl' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
