/// <reference lib="webworker" />
import Module from 'manifold-3d'
import type { Manifold, Mat4 } from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { parse, type Font } from 'opentype.js'
import fontUrl from '@fontsource/roboto/files/roboto-latin-700-normal.woff?url'
import { gearProfile } from './gear'
import { parseProfile } from './profile'
import { parsePath, pipe, spring } from './pipe'
import { capsule, dome, polygonSolid, pulley, roundedBox, wedge } from './shapes'
import { textContours } from './text'
import { bolt, nut, rod } from './thread'
import type { CsgNode, CsgRequest, CsgResponse, Outline, PlacedSolid, PrimitiveSpec, SolidData } from './protocol'

const ready = Module({ locateFile: () => wasmUrl }).then((wasm) => {
  wasm.setup()
  return wasm
})

type Wasm = Awaited<typeof ready>

let font: Font
const fontReady = fetch(fontUrl)
  .then((res) => res.arrayBuffer())
  .then((data) => (font = parse(data)))

function primitive(wasm: Wasm, spec: PrimitiveSpec): Manifold {
  switch (spec.kind) {
    case 'cube':
      return wasm.Manifold.cube([spec.x, spec.y, spec.z], true)
    case 'cylinder':
      return wasm.Manifold.cylinder(spec.height, spec.radius, spec.radius, spec.segments, true)
    case 'sphere':
      return wasm.Manifold.sphere(spec.radius, spec.segments)
    case 'cone':
      return wasm.Manifold.cylinder(spec.height, spec.radius, 0, spec.segments, true)
    case 'tube': {
      const outer = wasm.Manifold.cylinder(spec.height, spec.outerRadius, spec.outerRadius, spec.segments, true)
      const bore = wasm.Manifold.cylinder(spec.height * 2, spec.innerRadius, spec.innerRadius, spec.segments, true)
      const tube = outer.subtract(bore)
      outer.delete()
      bore.delete()
      return tube
    }
    case 'torus': {
      const circle = wasm.CrossSection.circle(spec.minorRadius, spec.segments / 2)
      const profile = circle.translate([spec.majorRadius, 0])
      const torus = wasm.Manifold.revolve(profile, spec.segments)
      circle.delete()
      profile.delete()
      return torus
    }
    case 'prism':
      return polygonSolid(wasm, spec.sides, spec.radius, spec.radius, spec.height)
    case 'pyramid':
      return polygonSolid(wasm, spec.sides, spec.radius, 0, spec.height)
    case 'wedge':
      return wedge(wasm, spec.x, spec.y, spec.z)
    case 'roundedBox':
      return roundedBox(wasm, [spec.x, spec.y, spec.z], spec.radius, spec.segments)
    case 'dome':
      return dome(wasm, spec.radius, spec.segments)
    case 'capsule':
      return capsule(wasm, spec.radius, spec.length, spec.segments)
    case 'pulley':
      return pulley(wasm, spec.diameter, spec.width, spec.grooveDepth, spec.bore)
    case 'revolve':
      return wasm.Manifold.revolve(parseProfile(spec.profile, true), spec.segments, spec.angle)
    case 'extrude': {
      const steps = Math.max(spec.taper !== 1 ? 1 : 0, Math.min(1800, Math.ceil(Math.abs(spec.twist) / 2)))
      const taper = Math.max(0.001, spec.taper)
      return wasm.Manifold.extrude(parseProfile(spec.profile, false), spec.height, steps, spec.twist, [taper, taper], true)
    }
    case 'arcSphere': {
      const ball = wasm.Manifold.sphere(spec.radius, spec.segments)
      if (spec.startZ <= -spec.radius && spec.endZ >= spec.radius) return ball
      // Clip to the requested Z band; trimByPlane keeps the side the normal points into.
      const clippedBottom = spec.startZ > -spec.radius ? ball.trimByPlane([0, 0, 1], spec.startZ) : ball
      if (clippedBottom !== ball) ball.delete()
      const finalClip = spec.endZ < spec.radius ? clippedBottom.trimByPlane([0, 0, -1], -spec.endZ) : clippedBottom
      if (finalClip !== clippedBottom) clippedBottom.delete()
      return finalClip
    }
    case 'pipe':
      return pipe(wasm, parsePath(spec.path), spec.radius, spec.segments)
    case 'spring':
      return spring(wasm, spec.coilRadius, spec.wireRadius, spec.pitch, spec.turns, spec.segments)
    case 'text': {
      const contours = textContours(font, spec.text, spec.letterHeight)
      if (contours.length === 0) throw new Error('Text has no printable characters in this font')
      const outline = new wasm.CrossSection(contours, 'EvenOdd')
      const solid = wasm.Manifold.extrude(outline, spec.thickness)
      outline.delete()
      return solid
    }
    case 'bolt':
      return bolt(wasm, spec.size, spec.length)
    case 'nut':
      return nut(wasm, spec.size, spec.clearance)
    case 'rod':
      return rod(wasm, spec.size, spec.length)
    case 'gear': {
      const outline = new wasm.CrossSection([gearProfile(spec)], 'Positive')
      const hole = wasm.CrossSection.circle(spec.bore / 2, 48)
      const profile = spec.bore > 0 ? outline.subtract(hole) : outline
      const gear = wasm.Manifold.extrude(profile, spec.thickness, 0, 0, [1, 1], true)
      outline.delete()
      hole.delete()
      if (profile !== outline) profile.delete()
      return gear
    }
  }
}

function place(wasm: Wasm, { solid, matrix }: PlacedSolid): Manifold {
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: solid.positions,
    triVerts: solid.indices,
  })
  const local = new wasm.Manifold(mesh)
  const world = local.transform(matrix as unknown as Mat4)
  local.delete()
  return world
}

function toSolid(m: Manifold): SolidData {
  const mesh = m.getMesh()
  if (mesh.numProp === 3) {
    return { positions: mesh.vertProperties, indices: mesh.triVerts }
  }
  const count = mesh.vertProperties.length / mesh.numProp
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions.set(mesh.vertProperties.subarray(i * mesh.numProp, i * mesh.numProp + 3), i * 3)
  }
  return { positions, indices: mesh.triVerts }
}

function evaluate(wasm: Wasm, node: CsgNode): Manifold {
  let local: Manifold
  if (node.op === 'fillet' || node.op === 'chamfer') {
    if (!node.children?.length || node.radius === undefined) throw new Error(`${node.op} needs one child and a radius`)
    const child = evaluate(wasm, node.children[0])
    // A high-segment sphere rounds smoothly; a 4-segment sphere (octahedron) cuts flat 45-degree chamfers.
    const operator = wasm.Manifold.sphere(node.radius, node.op === 'chamfer' ? 4 : 24)
    const eroded = child.minkowskiDifference(operator)
    local = eroded.minkowskiSum(operator)
    child.delete()
    operator.delete()
    eroded.delete()
  } else if (node.op) {
    const children = (node.children ?? []).map((child) => evaluate(wasm, child))
    const combine = { union: wasm.Manifold.union, subtract: wasm.Manifold.difference, intersect: wasm.Manifold.intersection }
    local = combine[node.op](children)
    for (const child of children) child.delete()
  } else if (node.spec) {
    const raw = primitive(wasm, node.spec)
    const { min, max } = raw.boundingBox()
    local = raw.translate([-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -(min[2] + max[2]) / 2])
    raw.delete()
  } else if (node.solid) {
    local = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: node.solid.positions, triVerts: node.solid.indices }))
  } else {
    throw new Error(`${node.name} has no geometry`)
  }
  const placed = local.transform(node.matrix as unknown as Mat4)
  local.delete()
  return placed
}

function section(wasm: Wasm, placed: PlacedSolid[], z: number): Outline[] {
  const parts = placed.map((p) => place(wasm, p))
  const merged = wasm.Manifold.union(parts)
  const slice = merged.slice(z)
  try {
    const outlines = slice.toPolygons().map((loop) => loop.map(([x, y]): [number, number] => [x, y]))
    if (outlines.length === 0) throw new Error(`Nothing is cut at Z = ${z} mm`)
    return outlines
  } finally {
    for (const p of parts) p.delete()
    merged.delete()
    slice.delete()
  }
}

function run(wasm: Wasm, req: CsgRequest): SolidData | Outline[] {
  if (req.type === 'section') return section(wasm, req.parts, req.z)

  if (req.type === 'primitive') {
    const m = primitive(wasm, req.spec)
    try {
      return toSolid(m)
    } finally {
      m.delete()
    }
  }

  if (req.type === 'validate') {
    let m: Manifold
    try {
      m = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: req.solid.positions, triVerts: req.solid.indices }))
    } catch {
      throw new Error('mesh is not watertight, so it cannot be used as a solid')
    }
    try {
      if (m.isEmpty()) throw new Error('mesh has no volume')
      return toSolid(m)
    } finally {
      m.delete()
    }
  }

  const result = evaluate(wasm, req.node)
  try {
    if (result.isEmpty()) throw new Error(`${req.node.op ?? req.node.name} produced an empty solid`)
    return toSolid(result)
  } finally {
    result.delete()
  }
}

self.onmessage = async (e: MessageEvent<{ id: number; req: CsgRequest }>) => {
  const { id, req } = e.data
  let res: CsgResponse
  try {
    await fontReady
    res = { id, ok: true, result: run(await ready, req) }
  } catch (err) {
    res = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  const transfer = res.ok && !Array.isArray(res.result) ? [res.result.positions.buffer, res.result.indices.buffer] : []
  self.postMessage(res, transfer)
}
