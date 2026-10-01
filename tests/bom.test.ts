import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { SceneObject } from '../src/document'
import { encodeBom } from '../src/io/bom'
import { unitCube } from './mesh'

function part(name: string, material?: string): SceneObject {
  const solid = unitCube()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(solid.positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(solid.indices, 1))
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
  mesh.scale.setScalar(10)
  return { id: 1, name, color: 0xc0864a, visible: true, material, solid, mesh }
}

const rows = (objects: SceneObject[]) => new TextDecoder().decode(encodeBom(objects)).trimEnd().split('\n')

describe('encodeBom', () => {
  it('writes one row per object with size, volume and mass', () => {
    const [header, row] = rows([part('Block', 'Steel')])
    expect(header.startsWith('Name,Color,Material,')).toBe(true)
    expect(row).toBe('Block,#c0864a,Steel,10.00,10.00,10.00,1.000,7.85,12,')
  })

  it('quotes cells with separators', () => {
    expect(rows([part('Bracket, left "A"')])[1].startsWith('"Bracket, left ""A""",#c0864a,PLA,')).toBe(true)
  })

  it('stops names from running as spreadsheet formulas', () => {
    expect(rows([part('=HYPERLINK("http://example.com")')])[1].startsWith(`"'=HYPERLINK(""http://example.com"")",`)).toBe(true)
    expect(rows([part('-1+2', '@SUM(A1)')])[1].startsWith("'-1+2,#c0864a,'@SUM(A1),")).toBe(true)
  })
})
