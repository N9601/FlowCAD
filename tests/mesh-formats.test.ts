import { Matrix4 } from 'three'
import { describe, expect, it } from 'vitest'
import { decodeObj, encode3mf, encodeObj } from '../src/io/mesh-formats'
import { decodePly, encodePly } from '../src/io/ply'
import { decodeGlb, encodeGlb } from '../src/io/gltf'
import { outwardIndices } from '../src/io/winding'
import { bounds, signedVolume, unitCube } from './mesh'

const IDENTITY = new Matrix4().toArray()
const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer
const decode = (buffer: ArrayBuffer) => new TextDecoder().decode(buffer)

describe('OBJ', () => {
  it('round-trips a named part', () => {
    const buffer = encodeObj([{ name: 'Unit cube', solid: unitCube(), matrix: IDENTITY }])
    expect(decode(buffer)).toContain('o Unit_cube')
    const decoded = decodeObj(buffer)
    expect(decoded.indices.length / 3).toBe(12)
    expect(signedVolume(decoded)).toBeCloseTo(1)
  })

  it('offsets face indices for each following part', () => {
    const shifted = new Matrix4().makeTranslation(3, 0, 0).toArray()
    const buffer = encodeObj([
      { name: 'a', solid: unitCube(), matrix: IDENTITY },
      { name: 'b', solid: unitCube(), matrix: shifted },
    ])
    const decoded = decodeObj(buffer)
    expect(signedVolume(decoded)).toBeCloseTo(2)
    expect(bounds(decoded)).toEqual([[0, 0, 0], [4, 1, 1]])
  })

  it('fan-triangulates polygons and accepts slashed and negative indices', () => {
    const text = ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'f 1/1/1 2/2/2 3/3/3 4/4/4', 'f -4 -2 -1'].join('\r\n')
    expect(decodeObj(encode(text)).indices.length).toBe(9)
  })

  it('rejects faces that point at missing vertices', () => {
    expect(() => decodeObj(encode('v 0 0 0\nv 1 0 0\nf 1 2 3'))).toThrow('missing vertex')
  })

  it('rejects files without faces', () => {
    expect(() => decodeObj(encode('v 0 0 0'))).toThrow('no faces')
  })
})

describe('PLY', () => {
  it('round-trips binary little-endian output', () => {
    const decoded = decodePly(encodePly([{ solid: unitCube(), matrix: IDENTITY }]))
    expect(decoded.indices.length / 3).toBe(12)
    expect(signedVolume(decoded)).toBeCloseTo(1)
  })

  it('reads ASCII files with polygon faces', () => {
    const text = [
      'ply',
      'format ascii 1.0',
      'element vertex 4',
      'property float x',
      'property float y',
      'property float z',
      'element face 1',
      'property list uchar int vertex_indices',
      'end_header',
      '0 0 0',
      '1 0 0',
      '1 1 0',
      '0 1 0',
      '4 0 1 2 3',
    ].join('\n')
    expect(decodePly(encode(text)).indices.length).toBe(6)
  })

  it('rejects unsupported encodings', () => {
    const text = 'ply\nformat binary_big_endian 1.0\nelement vertex 0\nend_header\n'
    expect(() => decodePly(encode(text))).toThrow('not supported')
    expect(() => decodePly(encode('hello'))).toThrow('Not a valid PLY file')
  })
})

describe('GLB', () => {
  it('round-trips millimetres and Z-up through glTF metres and Y-up', () => {
    const matrix = new Matrix4().makeTranslation(5, 6, 7).toArray()
    const decoded = decodeGlb(encodeGlb([{ name: 'cube', solid: unitCube(), matrix }]))
    const [min, max] = bounds(decoded)
    ;[5, 6, 7].forEach((v, k) => expect(min[k]).toBeCloseTo(v, 4))
    ;[6, 7, 8].forEach((v, k) => expect(max[k]).toBeCloseTo(v, 4))
    expect(signedVolume(decoded)).toBeCloseTo(1, 4)
  })

  it('rejects other files', () => {
    expect(() => decodeGlb(encode('not a glb file at all'))).toThrow('Not a binary glTF')
  })
})

describe('3MF', () => {
  it('writes a zip with the model and escapes part names', () => {
    const bytes = new Uint8Array(encode3mf([{ name: 'A & <B>', solid: unitCube(), matrix: IDENTITY }]))
    const text = new TextDecoder().decode(bytes)
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x04034b50)
    expect(text).toContain('[Content_Types].xml')
    expect(text).toContain('3D/3dmodel.model')
    expect(text).toContain('name="A &#38; &#60;B&#62;"')
    expect(text.match(/<triangle /g)).toHaveLength(12)
  })
})

describe('outwardIndices', () => {
  it('leaves normal placements alone and flips mirrored ones', () => {
    const cube = unitCube()
    expect(outwardIndices({ solid: cube, matrix: IDENTITY })).toBe(cube.indices)
    const flipped = outwardIndices({ solid: cube, matrix: new Matrix4().makeScale(1, 1, -1).toArray() })
    expect([...flipped.slice(0, 3)]).toEqual([0, 1, 2])
    expect(signedVolume({ positions: cube.positions, indices: flipped })).toBeCloseTo(-1)
  })
})
