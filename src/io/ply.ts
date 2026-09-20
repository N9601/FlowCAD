import * as THREE from 'three'
import type { PlacedSolid, SolidData } from '../csg/protocol'
import { weld } from './stl'

/** Binary little-endian PLY of all parts merged, in world space. */
export function encodePly(parts: readonly PlacedSolid[]): ArrayBuffer {
  const vertexCount = parts.reduce((n, p) => n + p.solid.positions.length / 3, 0)
  const faceCount = parts.reduce((n, p) => n + p.solid.indices.length / 3, 0)
  const header = new TextEncoder().encode(
    [
      'ply',
      'format binary_little_endian 1.0',
      'comment FlowCAD export, units: mm',
      `element vertex ${vertexCount}`,
      'property float x',
      'property float y',
      'property float z',
      `element face ${faceCount}`,
      'property list uchar int vertex_indices',
      'end_header',
      '',
    ].join('\n'),
  )

  const out = new Uint8Array(header.length + vertexCount * 12 + faceCount * 13)
  out.set(header)
  const view = new DataView(out.buffer)
  let at = header.length

  const v = new THREE.Vector3()
  const matrix = new THREE.Matrix4()
  for (const part of parts) {
    matrix.fromArray(part.matrix)
    for (let i = 0; i < part.solid.positions.length; i += 3) {
      v.fromArray(part.solid.positions, i).applyMatrix4(matrix)
      view.setFloat32(at, v.x, true)
      view.setFloat32(at + 4, v.y, true)
      view.setFloat32(at + 8, v.z, true)
      at += 12
    }
  }
  let base = 0
  for (const part of parts) {
    const idx = part.solid.indices
    for (let t = 0; t < idx.length; t += 3) {
      view.setUint8(at, 3)
      view.setInt32(at + 1, idx[t] + base, true)
      view.setInt32(at + 5, idx[t + 1] + base, true)
      view.setInt32(at + 9, idx[t + 2] + base, true)
      at += 13
    }
    base += part.solid.positions.length / 3
  }
  return out.buffer
}

type Reader = (view: DataView, at: number) => number

const TYPES: Record<string, [number, Reader]> = {
  char: [1, (v, at) => v.getInt8(at)],
  uchar: [1, (v, at) => v.getUint8(at)],
  short: [2, (v, at) => v.getInt16(at, true)],
  ushort: [2, (v, at) => v.getUint16(at, true)],
  int: [4, (v, at) => v.getInt32(at, true)],
  uint: [4, (v, at) => v.getUint32(at, true)],
  float: [4, (v, at) => v.getFloat32(at, true)],
  double: [8, (v, at) => v.getFloat64(at, true)],
}
for (const [alias, name] of [['int8', 'char'], ['uint8', 'uchar'], ['int16', 'short'], ['uint16', 'ushort'], ['int32', 'int'], ['uint32', 'uint'], ['float32', 'float'], ['float64', 'double']]) {
  TYPES[alias] = TYPES[name]
}

interface Property {
  name: string
  type: string
  /** Set for `property list <countType> <type> <name>`. */
  countType?: string
}

/** Reads ASCII or binary little-endian PLY. Polygons are fan-triangulated. */
export function decodePly(buffer: ArrayBuffer): SolidData {
  const bytes = new Uint8Array(buffer)
  const marker = 'end_header'
  const headerText = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 65536)))
  const markerAt = headerText.indexOf(marker)
  if (!headerText.startsWith('ply') || markerAt === -1) throw new Error('Not a valid PLY file')
  const bodyStart = headerText.indexOf('\n', markerAt) + 1

  let format = ''
  const elements: { name: string; count: number; properties: Property[] }[] = []
  for (const line of headerText.slice(0, markerAt).split('\n')) {
    const words = line.trim().split(/\s+/)
    if (words[0] === 'format') format = words[1]
    else if (words[0] === 'element') elements.push({ name: words[1], count: Number(words[2]), properties: [] })
    else if (words[0] === 'property') {
      const property = words[1] === 'list' ? { countType: words[2], type: words[3], name: words[4] } : { type: words[1], name: words[2] }
      if (!TYPES[property.type] || (property.countType && !TYPES[property.countType])) throw new Error(`PLY uses unsupported type "${property.type}"`)
      elements.at(-1)?.properties.push(property)
    }
  }
  if (format !== 'ascii' && format !== 'binary_little_endian') throw new Error(`PLY format "${format}" is not supported`)

  // Both encodings are read through one "next number of this type" function.
  let next: (type: string) => number
  if (format === 'ascii') {
    const tokens = new TextDecoder().decode(bytes.subarray(bodyStart)).split(/\s+/).filter(Boolean)
    let cursor = 0
    next = () => Number(tokens[cursor++])
  } else {
    const view = new DataView(buffer)
    let cursor = bodyStart
    next = (type) => {
      const [size, read] = TYPES[type]
      const value = read(view, cursor)
      cursor += size
      return value
    }
  }

  const vertices: number[][] = []
  const soup: number[] = []
  for (const element of elements) {
    for (let i = 0; i < element.count; i++) {
      const row: Record<string, number | number[]> = {}
      for (const p of element.properties) {
        row[p.name] = p.countType ? Array.from({ length: next(p.countType) }, () => next(p.type)) : next(p.type)
      }
      if (element.name === 'vertex') {
        vertices.push([row.x, row.y, row.z] as number[])
      } else if (element.name === 'face') {
        const corners = ((row.vertex_indices ?? row.vertex_index) as number[] | undefined)?.map((index) => vertices[index])
        if (!corners || corners.some((c) => !c)) throw new Error('PLY face refers to a missing vertex')
        for (let k = 1; k < corners.length - 1; k++) soup.push(...corners[0], ...corners[k], ...corners[k + 1])
      }
    }
  }
  if (soup.length === 0 || soup.some((n) => !Number.isFinite(n))) throw new Error('PLY file has no usable faces')
  return weld(new Float32Array(soup))
}
