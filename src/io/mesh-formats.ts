import * as THREE from 'three'
import type { PlacedSolid, SolidData } from '../csg/protocol'
import { weld } from './stl'
import { zip } from './zip'

export interface NamedPart extends PlacedSolid {
  name: string
}

const fmt = (n: number) => String(+n.toFixed(5))

/** World-space vertex coordinates of a part, formatted for text output. */
function worldVertices(part: PlacedSolid): string[][] {
  const matrix = new THREE.Matrix4().fromArray(part.matrix)
  const v = new THREE.Vector3()
  const out: string[][] = []
  for (let i = 0; i < part.solid.positions.length; i += 3) {
    v.fromArray(part.solid.positions, i).applyMatrix4(matrix)
    out.push([fmt(v.x), fmt(v.y), fmt(v.z)])
  }
  return out
}

export function encodeObj(parts: readonly NamedPart[]): ArrayBuffer {
  const lines = ['# FlowCAD OBJ export, units: mm']
  let base = 1
  for (const part of parts) {
    lines.push(`o ${part.name.replace(/\s+/g, '_')}`)
    const vertices = worldVertices(part)
    for (const v of vertices) lines.push(`v ${v.join(' ')}`)
    const idx = part.solid.indices
    for (let t = 0; t < idx.length; t += 3) {
      lines.push(`f ${idx[t] + base} ${idx[t + 1] + base} ${idx[t + 2] + base}`)
    }
    base += vertices.length
  }
  return new TextEncoder().encode(lines.join('\n') + '\n').buffer as ArrayBuffer
}

/** Reads vertices and faces from a Wavefront OBJ; polygons are fan-triangulated, groups are merged. */
export function decodeObj(buffer: ArrayBuffer): SolidData {
  const vertices: number[][] = []
  const soup: number[] = []
  for (const line of new TextDecoder().decode(buffer).split('\n')) {
    const [tag, ...args] = line.trim().split(/\s+/)
    if (tag === 'v') {
      vertices.push(args.slice(0, 3).map(Number))
    } else if (tag === 'f') {
      const corners = args.map((arg) => {
        const index = parseInt(arg, 10)
        const vertex = vertices[index < 0 ? vertices.length + index : index - 1]
        if (!vertex) throw new Error('OBJ face refers to a missing vertex')
        return vertex
      })
      for (let i = 1; i < corners.length - 1; i++) soup.push(...corners[0], ...corners[i], ...corners[i + 1])
    }
  }
  if (soup.length === 0) throw new Error('OBJ file has no faces')
  return weld(new Float32Array(soup))
}

const escapeXml = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`)

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'

const RELS =
  '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'

export function encode3mf(parts: readonly NamedPart[]): ArrayBuffer {
  const objects = parts.map((part, i) => {
    const vertices = worldVertices(part).map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`)
    const idx = part.solid.indices
    const triangles: string[] = []
    for (let t = 0; t < idx.length; t += 3) {
      triangles.push(`<triangle v1="${idx[t]}" v2="${idx[t + 1]}" v3="${idx[t + 2]}"/>`)
    }
    return `<object id="${i + 1}" type="model" name="${escapeXml(part.name)}"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object>`
  })
  const items = parts.map((_, i) => `<item objectid="${i + 1}"/>`)
  const model = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    '<metadata name="Application">FlowCAD</metadata>',
    `<resources>${objects.join('')}</resources>`,
    `<build>${items.join('')}</build>`,
    '</model>',
  ].join('\n')

  return zip([
    { path: '[Content_Types].xml', text: CONTENT_TYPES },
    { path: '_rels/.rels', text: RELS },
    { path: '3D/3dmodel.model', text: model },
  ])
}
