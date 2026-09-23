import { describe, expect, it } from 'vitest'
import { checkSpec } from '../src/catalog'
import { gearProfile } from '../src/csg/gear'
import { metricSize } from '../src/csg/iso'
import { parsePath } from '../src/csg/pipe'
import { parseProfile } from '../src/csg/profile'
import { encodeDxf, encodeSvg } from '../src/io/section'
import { gramsOf } from '../src/materials'

const doubledArea = (points: [number, number][]) =>
  points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length]
    return sum + x * ny - nx * y
  }, 0)

describe('parseProfile', () => {
  it('reads x,y pairs separated by spaces or semicolons', () => {
    expect(parseProfile(' 0,0; 10,0  10,5 ', false)).toEqual([[0, 0], [10, 0], [10, 5]])
  })

  it('returns a counter-clockwise outline whichever way it was drawn', () => {
    expect(doubledArea(parseProfile('0,0 0,10 10,10 10,0', false))).toBeGreaterThan(0)
  })

  it('rejects bad points, too few points, zero area and negative radii', () => {
    expect(() => parseProfile('0,0 1 2,2', false)).toThrow('"1" is not a valid point')
    expect(() => parseProfile('0,0 1,1', false)).toThrow('at least 3 points')
    expect(() => parseProfile('0,0 1,1 2,2', false)).toThrow('no area')
    expect(() => parseProfile('-1,0 5,0 5,5', true)).toThrow('cannot be negative')
  })
})

describe('parsePath', () => {
  it('reads xyz triples', () => {
    expect(parsePath('0,0,0 1,2,3')).toEqual([[0, 0, 0], [1, 2, 3]])
  })

  it('rejects malformed points and single-point paths', () => {
    expect(() => parsePath('0,0 1,1,1')).toThrow('"0,0" is not a valid xyz point')
    expect(() => parsePath('1,2,3')).toThrow('at least two points')
  })
})

describe('gearProfile', () => {
  it('is counter-clockwise and stays between the root and tip circles', () => {
    const spec = { module: 2, teeth: 20, pressureAngle: 20 }
    const points = gearProfile(spec)
    expect(doubledArea(points)).toBeGreaterThan(0)
    const pitch = (spec.module * spec.teeth) / 2
    for (const [x, y] of points) {
      const r = Math.hypot(x, y)
      expect(r).toBeGreaterThanOrEqual(pitch - 1.25 * spec.module - 1e-9)
      expect(r).toBeLessThanOrEqual(pitch + spec.module + 1e-9)
    }
  })
})

describe('metricSize', () => {
  it('looks up ISO coarse threads', () => {
    expect(metricSize(8).pitch).toBe(1.25)
    expect(() => metricSize(7)).toThrow('M7 is not a supported metric size')
  })
})

describe('checkSpec', () => {
  it('accepts the catalogue defaults', () => {
    expect(() => checkSpec({ kind: 'cube', x: 20, y: 20, z: 20 })).not.toThrow()
    expect(() => checkSpec({ kind: 'gear', module: 2, teeth: 20, pressureAngle: 20, thickness: 8, bore: 8 })).not.toThrow()
  })

  it('rejects dimensions that cannot make a solid', () => {
    expect(() => checkSpec({ kind: 'tube', outerRadius: 5, innerRadius: 5, height: 10, segments: 32 })).toThrow('Inner radius')
    expect(() => checkSpec({ kind: 'roundedBox', x: 10, y: 10, z: 4, radius: 2, segments: 16 })).toThrow('Corner radius')
    expect(() => checkSpec({ kind: 'text', text: '   ', letterHeight: 10, thickness: 2 })).toThrow('1 to 60 characters')
    expect(() => checkSpec({ kind: 'gear', module: 1, teeth: 10, pressureAngle: 20, thickness: 4, bore: 8 })).toThrow('root diameter')
  })
})

describe('section export', () => {
  const square: [number, number][][] = [[[0, 0], [10, 0], [10, 5], [0, 5]]]

  it('writes a 1:1 millimetre SVG with Y flipped', () => {
    const svg = new TextDecoder().decode(encodeSvg(square))
    expect(svg).toContain('width="12mm" height="7mm"')
    expect(svg).toContain('d="M1 6L11 6L11 1L1 1Z"')
  })

  it('writes one closed polyline per outline to DXF', () => {
    const dxf = new TextDecoder().decode(encodeDxf([...square, ...square]))
    expect(dxf.match(/^POLYLINE$/gm)).toHaveLength(2)
    expect(dxf.match(/^VERTEX$/gm)).toHaveLength(8)
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true)
  })
})

describe('gramsOf', () => {
  it('uses the material density and falls back to PLA', () => {
    expect(gramsOf(1000, 'Steel')).toBeCloseTo(7.85)
    expect(gramsOf(1000, undefined)).toBeCloseTo(1.24)
    expect(gramsOf(1000, 'Unobtainium')).toBeCloseTo(1.24)
  })
})
