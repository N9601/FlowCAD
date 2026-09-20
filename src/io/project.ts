import type { CsgNode, SolidData } from '../csg/protocol'
import type { SavedDocument } from '../document'

const VERSION = 1

/**
 * `.flowcad` file: JSON with the whole scene. Solids are base64-packed so booleans-in-place, imports
 * and mesh normals are all preserved without an on-load kernel round trip.
 */
interface FlowcadFile {
  version: number
  generator: string
  objects: SerializedObject[]
}

interface SerializedObject {
  id: number
  name: string
  color: number
  matrix: number[]
  solid: SerializedSolid
  visible?: boolean
  groupId?: number
  material?: string
  spec?: unknown
  tree?: SerializedTree
}

interface SerializedSolid {
  positions: string
  indices: string
}

interface SerializedTree {
  name: string
  matrix: number[]
  op?: string
  spec?: unknown
  solid?: SerializedSolid
  children?: SerializedTree[]
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(s)
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const packSolid = (solid: SolidData): SerializedSolid => ({
  positions: bytesToBase64(new Uint8Array(solid.positions.buffer, solid.positions.byteOffset, solid.positions.byteLength)),
  indices: bytesToBase64(new Uint8Array(solid.indices.buffer, solid.indices.byteOffset, solid.indices.byteLength)),
})

const unpackSolid = (packed: SerializedSolid): SolidData => ({
  positions: new Float32Array(base64ToBytes(packed.positions).buffer),
  indices: new Uint32Array(base64ToBytes(packed.indices).buffer),
})

function packTree(tree: CsgNode): SerializedTree {
  return {
    name: tree.name,
    matrix: tree.matrix,
    op: tree.op,
    spec: tree.spec,
    solid: tree.solid ? packSolid(tree.solid) : undefined,
    children: tree.children?.map(packTree),
  }
}

function unpackTree(packed: SerializedTree): CsgNode {
  return {
    name: packed.name,
    matrix: packed.matrix,
    op: packed.op as CsgNode['op'],
    spec: packed.spec as CsgNode['spec'],
    solid: packed.solid ? unpackSolid(packed.solid) : undefined,
    children: packed.children?.map(unpackTree),
  }
}

export function encodeProject(objects: SavedDocument): ArrayBuffer {
  const file: FlowcadFile = {
    version: VERSION,
    generator: 'FlowCAD',
    objects: objects.map((o) => ({
      id: o.id,
      name: o.name,
      color: o.color,
      matrix: o.matrix,
      solid: packSolid(o.solid),
      visible: o.visible,
      groupId: o.groupId,
      material: o.material,
      spec: o.spec,
      tree: o.tree ? packTree(o.tree) : undefined,
    })),
  }
  return new TextEncoder().encode(JSON.stringify(file)).buffer as ArrayBuffer
}

export function decodeProject(buffer: ArrayBuffer): SavedDocument {
  let file: FlowcadFile
  try {
    file = JSON.parse(new TextDecoder().decode(buffer))
  } catch {
    throw new Error('Not a valid .flowcad file')
  }
  if (file?.generator !== 'FlowCAD') throw new Error('This file was not produced by FlowCAD')
  if (file.version !== VERSION) throw new Error(`This file uses .flowcad format v${file.version}; this build reads v${VERSION}`)
  return file.objects.map((o) => ({
    id: o.id,
    name: o.name,
    color: o.color ?? 0x8fa3b8,
    visible: o.visible !== false,
    groupId: o.groupId,
    material: o.material,
    matrix: o.matrix,
    solid: unpackSolid(o.solid),
    spec: o.spec as SavedDocument[number]['spec'],
    tree: o.tree ? unpackTree(o.tree) : undefined,
  }))
}
