import * as THREE from 'three'
import type { PlacedSolid, SolidData } from '../csg/protocol'

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

function readTriangleSoup(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer)
  const count = buffer.byteLength >= HEADER_BYTES + 4 ? view.getUint32(HEADER_BYTES, true) : 0
  if (count > 0 && buffer.byteLength === HEADER_BYTES + 4 + count * TRIANGLE_BYTES) {
    const soup = new Float32Array(count * 9)
    for (let t = 0; t < count; t++) {
      const base = HEADER_BYTES + 4 + t * TRIANGLE_BYTES + 12
      for (let k = 0; k < 9; k++) soup[t * 9 + k] = view.getFloat32(base + k * 4, true)
    }
    return soup
  }
  const text = new TextDecoder().decode(buffer)
  const numbers = [...text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap((m) => [+m[1], +m[2], +m[3]])
  return new Float32Array(numbers)
}

/** Parses binary or ASCII STL and welds coincident vertices into an indexed mesh. */
export function decodeStl(buffer: ArrayBuffer): SolidData {
  const soup = readTriangleSoup(buffer)
  if (soup.length === 0 || soup.length % 9 !== 0) throw new Error('Not a valid STL file')

  const lookup = new Map<string, number>()
  const positions: number[] = []
  const indices = new Uint32Array(soup.length / 3)
  for (let i = 0; i < indices.length; i++) {
    const x = soup[i * 3]
    const y = soup[i * 3 + 1]
    const z = soup[i * 3 + 2]
    const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`
    let index = lookup.get(key)
    if (index === undefined) {
      index = positions.length / 3
      lookup.set(key, index)
      positions.push(x, y, z)
    }
    indices[i] = index
  }
  return { positions: new Float32Array(positions), indices }
}

export function download(data: ArrayBuffer, filename: string) {
  const url = URL.createObjectURL(new Blob([data]))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
