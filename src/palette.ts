import { csg } from './csg/client'
import type { PrimitiveSpec } from './csg/protocol'
import type { CadDocument } from './document'

interface Shape {
  label: string
  spec: PrimitiveSpec
}

const CATEGORIES: { title: string; shapes: Shape[] }[] = [
  {
    title: 'Basic',
    shapes: [
      { label: 'Cube', spec: { kind: 'cube', x: 20, y: 20, z: 20 } },
      { label: 'Cylinder', spec: { kind: 'cylinder', radius: 10, height: 20, segments: 64 } },
      { label: 'Sphere', spec: { kind: 'sphere', radius: 12, segments: 64 } },
      { label: 'Cone', spec: { kind: 'cone', radius: 10, height: 20, segments: 64 } },
      { label: 'Tube', spec: { kind: 'tube', outerRadius: 10, innerRadius: 7, height: 20, segments: 64 } },
      { label: 'Torus', spec: { kind: 'torus', majorRadius: 14, minorRadius: 4, segments: 64 } },
    ],
  },
  {
    title: 'More solids',
    shapes: [
      { label: 'Prism', spec: { kind: 'prism', sides: 6, radius: 10, height: 20 } },
      { label: 'Pyramid', spec: { kind: 'pyramid', sides: 4, radius: 12, height: 20 } },
      { label: 'Wedge', spec: { kind: 'wedge', x: 30, y: 20, z: 15 } },
      { label: 'Round box', spec: { kind: 'roundedBox', x: 30, y: 20, z: 12, radius: 3, segments: 32 } },
      { label: 'Dome', spec: { kind: 'dome', radius: 12, segments: 64 } },
      { label: 'Capsule', spec: { kind: 'capsule', radius: 6, length: 30, segments: 48 } },
    ],
  },
  {
    title: 'Mechanical',
    shapes: [
      { label: 'Bolt', spec: { kind: 'bolt', size: 8, length: 25 } },
      { label: 'Nut', spec: { kind: 'nut', size: 8, clearance: 0.15 } },
      { label: 'Rod', spec: { kind: 'rod', size: 8, length: 40 } },
      { label: 'Pulley', spec: { kind: 'pulley', diameter: 40, width: 12, grooveDepth: 6, bore: 8 } },
      { label: 'Gear', spec: { kind: 'gear', module: 2, teeth: 20, pressureAngle: 20, thickness: 8, bore: 8 } },
    ],
  },
]

export function buildPalette(root: HTMLElement, status: HTMLElement, doc: CadDocument) {
  for (const { title, shapes } of CATEGORIES) {
    root.appendChild(Object.assign(document.createElement('h2'), { textContent: title }))
    const grid = root.appendChild(Object.assign(document.createElement('div'), { className: 'grid' }))
    for (const { label, spec } of shapes) {
      const button = grid.appendChild(Object.assign(document.createElement('button'), { textContent: label }))
      button.addEventListener('click', async () => {
        try {
          doc.add(label, await csg.primitive(spec), spec)
          doc.commit()
        } catch (err) {
          status.textContent = `Error: ${err instanceof Error ? err.message : err}`
        }
      })
    }
  }
}
