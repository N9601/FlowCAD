import * as THREE from 'three'
import type { SolidData } from '../csg/protocol'
import type { NamedPart } from './mesh-formats'
import { weld } from './stl'

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942
const FLOAT = 5126
const UNSIGNED_INT = 5125
const MM_PER_METRE = 1000

// glTF is Y-up and in metres; FlowCAD is Z-up and in millimetres.
const TO_GLTF = new THREE.Matrix4().makeRotationX(-Math.PI / 2).scale(new THREE.Vector3().setScalar(1 / MM_PER_METRE))
const FROM_GLTF = TO_GLTF.clone().invert()

const pad4 = (n: number) => (n + 3) & ~3

export function encodeGlb(parts: readonly NamedPart[]): ArrayBuffer {
  const views: { byteOffset: number; byteLength: number; target: number }[] = []
  const accessors: object[] = []
  const chunks: { offset: number; bytes: Uint8Array }[] = []
  let binLength = 0

  const addView = (data: Float32Array | Uint32Array, target: number) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    views.push({ byteOffset: binLength, byteLength: bytes.length, target })
    chunks.push({ offset: binLength, bytes })
    binLength = pad4(binLength + bytes.length)
    return views.length - 1
  }

  const meshes = parts.map((part) => {
    const { positions, indices } = part.solid
    const box = new THREE.Box3().setFromArray(positions)
    accessors.push({ bufferView: addView(positions, 34962), componentType: FLOAT, count: positions.length / 3, type: 'VEC3', min: box.min.toArray(), max: box.max.toArray() })
    accessors.push({ bufferView: addView(indices, 34963), componentType: UNSIGNED_INT, count: indices.length, type: 'SCALAR' })
    return { name: part.name, primitives: [{ attributes: { POSITION: accessors.length - 2 }, indices: accessors.length - 1, material: 0 }] }
  })

  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'FlowCAD' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'FlowCAD', matrix: TO_GLTF.toArray(), children: parts.map((_, i) => i + 1) },
      ...parts.map((part, i) => ({ name: part.name, mesh: i, matrix: part.matrix })),
    ],
    meshes,
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.56, 0.64, 0.72, 1], metallicFactor: 0.1, roughnessFactor: 0.55 } }],
    accessors,
    bufferViews: views.map((v) => ({ buffer: 0, ...v })),
    buffers: [{ byteLength: binLength }],
  })
  const jsonBytes = new TextEncoder().encode(json)
  const jsonLength = pad4(jsonBytes.length)

  const out = new Uint8Array(12 + 8 + jsonLength + 8 + binLength)
  const view = new DataView(out.buffer)
  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, out.length, true)
  view.setUint32(12, jsonLength, true)
  view.setUint32(16, CHUNK_JSON, true)
  out.fill(0x20, 20, 20 + jsonLength) // JSON chunks are padded with spaces
  out.set(jsonBytes, 20)
  const binStart = 20 + jsonLength
  view.setUint32(binStart, binLength, true)
  view.setUint32(binStart + 4, CHUNK_BIN, true)
  for (const { offset, bytes } of chunks) out.set(bytes, binStart + 8 + offset)
  return out.buffer
}

interface GltfNode {
  mesh?: number
  children?: number[]
  matrix?: number[]
  translation?: number[]
  rotation?: number[]
  scale?: number[]
}

interface Gltf {
  scene?: number
  scenes?: { nodes: number[] }[]
  nodes?: GltfNode[]
  meshes?: { primitives: { attributes: { POSITION?: number }; indices?: number; mode?: number }[] }[]
  accessors?: { bufferView?: number; byteOffset?: number; componentType: number; count: number; sparse?: unknown }[]
  bufferViews?: { buffer: number; byteOffset?: number; byteStride?: number }[]
}

const COMPONENT_READERS: Record<number, [number, (v: DataView, at: number) => number]> = {
  5121: [1, (v, at) => v.getUint8(at)],
  5123: [2, (v, at) => v.getUint16(at, true)],
  5125: [4, (v, at) => v.getUint32(at, true)],
  5126: [4, (v, at) => v.getFloat32(at, true)],
}

/** Reads every triangle of a binary glTF into one mesh, in millimetres, Z-up. */
export function decodeGlb(buffer: ArrayBuffer): SolidData {
  const file = new DataView(buffer)
  if (buffer.byteLength < 20 || file.getUint32(0, true) !== GLB_MAGIC) throw new Error('Not a binary glTF (.glb) file')

  let gltf: Gltf | undefined
  let bin: DataView | undefined
  for (let at = 12; at + 8 <= buffer.byteLength; ) {
    const length = file.getUint32(at, true)
    const type = file.getUint32(at + 4, true)
    if (type === CHUNK_JSON) gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, at + 8, length)))
    else if (type === CHUNK_BIN) bin = new DataView(buffer, at + 8, length)
    at += 8 + length
  }
  if (!gltf || !bin) throw new Error('GLB file has no embedded geometry')
  const data = bin
  const { nodes = [], meshes = [], accessors = [], bufferViews = [] } = gltf

  const read = (index: number, components: number): number[] => {
    const accessor = accessors[index]
    const reader = COMPONENT_READERS[accessor?.componentType]
    if (!accessor || accessor.bufferView === undefined || accessor.sparse || !reader) throw new Error('GLB uses an unsupported data layout')
    const bufferView = bufferViews[accessor.bufferView]
    if (bufferView.buffer !== 0) throw new Error('GLB with external buffers is not supported')
    const [size, get] = reader
    const stride = bufferView.byteStride ?? size * components
    const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    const values: number[] = []
    for (let i = 0; i < accessor.count; i++) {
      for (let c = 0; c < components; c++) values.push(get(data, start + i * stride + c * size))
    }
    return values
  }

  const soup: number[] = []
  const vertex = new THREE.Vector3()
  const visit = (index: number, parent: THREE.Matrix4) => {
    const node = nodes[index]
    if (!node) return
    const local = node.matrix
      ? new THREE.Matrix4().fromArray(node.matrix)
      : new THREE.Matrix4().compose(
          new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]),
          new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
          new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]),
        )
    const world = parent.clone().multiply(local)
    for (const primitive of meshes[node.mesh ?? -1]?.primitives ?? []) {
      if ((primitive.mode ?? 4) !== 4 || primitive.attributes.POSITION === undefined) continue
      const positions = read(primitive.attributes.POSITION, 3)
      const indices = primitive.indices === undefined ? positions.map((_, i) => i).slice(0, positions.length / 3) : read(primitive.indices, 1)
      for (const i of indices) soup.push(...vertex.fromArray(positions, i * 3).applyMatrix4(world).toArray())
    }
    for (const child of node.children ?? []) visit(child, world)
  }
  for (const root of gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? []) visit(root, FROM_GLTF)

  if (soup.length === 0) throw new Error('GLB file contains no triangles')
  return weld(new Float32Array(soup))
}
