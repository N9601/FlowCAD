import { Matrix4 } from 'three'
import { describe, expect, it } from 'vitest'
import type { SavedDocument } from '../src/document'
import { decodeProject, encodeProject } from '../src/io/project'
import { zip } from '../src/io/zip'
import { unitCube } from './mesh'

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer

describe('.flowcad project files', () => {
  const scene: SavedDocument = [
    {
      id: 3,
      name: 'Plate',
      color: 0xc0864a,
      visible: true,
      groupId: 2,
      material: 'Brass',
      matrix: new Matrix4().makeTranslation(1, 2, 3).toArray(),
      solid: unitCube(),
      tree: {
        name: 'Subtract',
        op: 'subtract',
        matrix: new Matrix4().toArray(),
        children: [
          { name: 'Cube 1', matrix: new Matrix4().toArray(), spec: { kind: 'cube', x: 20, y: 20, z: 5 } },
          { name: 'Import', matrix: new Matrix4().toArray(), solid: unitCube() },
        ],
      },
    },
    { id: 4, name: 'Hidden', color: 0x8fa3b8, visible: false, matrix: new Matrix4().toArray(), solid: unitCube(), spec: { kind: 'cube', x: 1, y: 1, z: 1 } },
  ]

  it('round-trips objects, solids and boolean history', () => {
    const decoded = decodeProject(encodeProject(scene))
    expect(decoded).toHaveLength(2)
    const [plate, hidden] = decoded
    expect(plate).toMatchObject({ id: 3, name: 'Plate', color: 0xc0864a, visible: true, groupId: 2, material: 'Brass' })
    expect(plate.matrix).toEqual(scene[0].matrix)
    expect(plate.solid.positions).toEqual(unitCube().positions)
    expect(plate.solid.indices).toEqual(unitCube().indices)
    expect(plate.tree?.op).toBe('subtract')
    expect(plate.tree?.children?.[0].spec).toEqual({ kind: 'cube', x: 20, y: 20, z: 5 })
    expect(plate.tree?.children?.[1].solid?.indices).toEqual(unitCube().indices)
    expect(hidden.visible).toBe(false)
    expect(hidden.spec).toEqual({ kind: 'cube', x: 1, y: 1, z: 1 })
  })

  it('rejects files that are not FlowCAD projects', () => {
    expect(() => decodeProject(new TextEncoder().encode('not json').buffer as ArrayBuffer)).toThrow('Not a valid .flowcad file')
    expect(() => decodeProject(encode({ generator: 'Other', version: 1, objects: [] }))).toThrow('not produced by FlowCAD')
    expect(() => decodeProject(encode({ generator: 'FlowCAD', version: 99, objects: [] }))).toThrow('format v99')
    expect(() => decodeProject(encode({ generator: 'FlowCAD', version: 1 }))).toThrow('Not a valid .flowcad file')
  })

  it('rejects damaged objects with a clear message', () => {
    const valid = JSON.parse(new TextDecoder().decode(encodeProject(scene.slice(1))))
    const withObject = (patch: object) => encode({ ...valid, objects: [{ ...valid.objects[0], ...patch }] })
    expect(() => decodeProject(withObject({ matrix: [1, 0, 0] }))).toThrow('missing its id or placement')
    expect(() => decodeProject(withObject({ solid: undefined }))).toThrow('an object has no mesh')
    expect(() => decodeProject(withObject({ solid: { positions: '%%%', indices: '' } }))).toThrow('cannot be decoded')
    const outOfRange = btoa(String.fromCharCode(...new Uint8Array(new Uint32Array([0, 1, 99]).buffer)))
    expect(() => decodeProject(withObject({ solid: { ...valid.objects[0].solid, indices: outOfRange } }))).toThrow('missing vertices')
  })
})

describe('zip', () => {
  it('writes stored entries with correct CRCs and a central directory', () => {
    const bytes = new Uint8Array(zip([{ path: 'a.txt', text: 'hello' }, { path: 'dir/b.txt', text: '' }]))
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(view.getUint32(14, true)).toBe(0x3610a686) // CRC-32 of "hello"
    expect(view.getUint32(18, true)).toBe(5)
    const end = bytes.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(2)
    const centralStart = view.getUint32(end + 16, true)
    expect(view.getUint32(centralStart, true)).toBe(0x02014b50)
    expect(view.getUint32(end + 12, true)).toBe(end - centralStart)
  })
})
