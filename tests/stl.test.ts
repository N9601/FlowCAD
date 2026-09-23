import { Matrix4 } from 'three'
import { describe, expect, it } from 'vitest'
import { decodeStl, encodeBinaryStl, weld } from '../src/io/stl'
import { bounds, signedVolume, unitCube } from './mesh'

const IDENTITY = new Matrix4().toArray()

describe('binary STL', () => {
  it('round-trips a solid in world space', () => {
    const matrix = new Matrix4().makeTranslation(10, 0, 0).toArray()
    const decoded = decodeStl(encodeBinaryStl([{ solid: unitCube(), matrix }]))
    expect(decoded.positions.length / 3).toBe(8)
    expect(decoded.indices.length / 3).toBe(12)
    expect(signedVolume(decoded)).toBeCloseTo(1)
    expect(bounds(decoded)).toEqual([[10, 0, 0], [11, 1, 1]])
  })

  it('merges every part into one file', () => {
    const shifted = new Matrix4().makeTranslation(5, 0, 0).toArray()
    const buffer = encodeBinaryStl([{ solid: unitCube(), matrix: IDENTITY }, { solid: unitCube(), matrix: shifted }])
    expect(buffer.byteLength).toBe(84 + 24 * 50)
    expect(signedVolume(decodeStl(buffer))).toBeCloseTo(2)
  })

  it('keeps mirrored parts facing outward', () => {
    const mirrored = new Matrix4().makeScale(-1, 1, 1).toArray()
    expect(signedVolume(decodeStl(encodeBinaryStl([{ solid: unitCube(), matrix: mirrored }])))).toBeCloseTo(1)
  })
})

describe('ASCII STL', () => {
  it('parses facets and welds shared corners', () => {
    const text = [
      'solid tri',
      'facet normal 0 0 1',
      'outer loop',
      'vertex 0 0 0',
      'vertex 1 0 0',
      'vertex 0 1 0',
      'endloop',
      'endfacet',
      'facet normal 0 0 1',
      'outer loop',
      'vertex 1 0 0',
      'vertex 1 1 0',
      'vertex 0 1 0',
      'endloop',
      'endfacet',
      'endsolid tri',
    ].join('\n')
    const decoded = decodeStl(new TextEncoder().encode(text).buffer as ArrayBuffer)
    expect(decoded.indices.length).toBe(6)
    expect(decoded.positions.length / 3).toBe(4)
  })

  it('rejects files with no triangles', () => {
    expect(() => decodeStl(new TextEncoder().encode('solid empty\nendsolid empty').buffer as ArrayBuffer)).toThrow('Not a valid STL file')
    expect(() => decodeStl(new ArrayBuffer(10))).toThrow('Not a valid STL file')
  })
})

describe('weld', () => {
  it('merges vertices that agree to 1e-5 mm', () => {
    const soup = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1.000001, 0, 0, 1, 1, 0, 0, 1, 0])
    const { positions, indices } = weld(soup)
    expect(positions.length / 3).toBe(4)
    expect([...indices]).toEqual([0, 1, 2, 1, 3, 2])
  })
})
