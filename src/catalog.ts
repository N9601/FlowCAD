import type { PrimitiveSpec } from './csg/protocol'
import { parsePath } from './csg/pipe'
import { parseProfile } from './csg/profile'
import { grooveOpening } from './csg/shapes'

export interface Shape {
  label: string
  spec: PrimitiveSpec
}

export const CATEGORIES: { title: string; shapes: Shape[] }[] = [
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
      { label: 'Revolve', spec: { kind: 'revolve', profile: '0,0 14,0 14,4 6,8 6,26 10,30 0,30', angle: 360, segments: 64 } },
      { label: 'Extrude', spec: { kind: 'extrude', profile: '0,0 30,0 30,8 8,8 8,20 0,20', height: 10, twist: 0, taper: 1 } },
      { label: 'ArcSphere', spec: { kind: 'arcSphere', radius: 15, startZ: 0, endZ: 15, segments: 48 } },
      { label: 'Text', spec: { kind: 'text', text: 'FlowCAD', letterHeight: 10, thickness: 3 } },
      { label: 'Capsule', spec: { kind: 'capsule', radius: 6, length: 30, segments: 48 } },
    ],
  },
  {
    title: 'Mechanical',
    shapes: [
      { label: 'Bolt', spec: { kind: 'bolt', size: 8, length: 25 } },
      { label: 'Nut', spec: { kind: 'nut', size: 8, clearance: 0.15 } },
      { label: 'Rod', spec: { kind: 'rod', size: 8, length: 40 } },
      { label: 'Pipe', spec: { kind: 'pipe', path: '-30,0,0 30,0,0 30,30,0 30,30,30', radius: 2, segments: 24 } },
      { label: 'Spring', spec: { kind: 'spring', coilRadius: 12, wireRadius: 2, pitch: 6, turns: 6, segments: 24 } },
      { label: 'Pulley', spec: { kind: 'pulley', diameter: 40, width: 12, grooveDepth: 6, bore: 8 } },
      { label: 'Gear', spec: { kind: 'gear', module: 2, teeth: 20, pressureAngle: 20, thickness: 8, bore: 8 } },
    ],
  },
]

/** Rejects dimension combinations that cannot make a valid solid. */
export function checkSpec(spec: PrimitiveSpec) {
  if (spec.kind === 'tube' && spec.innerRadius >= spec.outerRadius) {
    throw new Error('Inner radius must be smaller than outer radius')
  }
  if (spec.kind === 'torus' && spec.minorRadius >= spec.majorRadius) {
    throw new Error('Tube radius must be smaller than major radius')
  }
  if (spec.kind === 'roundedBox' && spec.radius * 2 >= Math.min(spec.x, spec.y, spec.z)) {
    throw new Error('Corner radius must be less than half the smallest side')
  }
  if (spec.kind === 'capsule' && spec.length <= spec.radius * 2) {
    throw new Error('Overall length must be more than twice the radius')
  }
  if (spec.kind === 'pulley') {
    if (grooveOpening(spec.width, spec.grooveDepth) >= spec.width) throw new Error('Groove is too deep for this width')
    if (spec.bore / 2 >= spec.diameter / 2 - spec.grooveDepth) throw new Error('Bore must be smaller than the groove diameter')
  }
  if (spec.kind === 'revolve') parseProfile(spec.profile, true)
  if (spec.kind === 'extrude') parseProfile(spec.profile, false)
  if (spec.kind === 'extrude' && spec.taper < 0) throw new Error('Taper cannot be negative')
  if (spec.kind === 'arcSphere' && spec.startZ >= spec.endZ) throw new Error('Start Z must be less than end Z')
  if (spec.kind === 'pipe') parsePath(spec.path)
  if (spec.kind === 'spring' && spec.turns <= 0) throw new Error('Spring needs at least one turn')
  if (spec.kind === 'text' && (spec.text.trim() === '' || spec.text.length > 60)) {
    throw new Error('Text must be 1 to 60 characters')
  }
  if ((spec.kind === 'bolt' || spec.kind === 'rod') && spec.length > 200) {
    throw new Error('Length is limited to 200 mm')
  }
  if (spec.kind === 'gear' && spec.bore >= spec.module * (spec.teeth - 2.5)) {
    throw new Error('Bore must be smaller than the root diameter')
  }
}
