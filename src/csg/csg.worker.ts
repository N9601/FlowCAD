/// <reference lib="webworker" />
import Module from 'manifold-3d'
import type { Manifold, Mat4 } from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { gearProfile } from './gear'
import { bolt, nut, rod } from './thread'
import type { CsgRequest, CsgResponse, Outline, PlacedSolid, PrimitiveSpec, SolidData } from './protocol'

const ready = Module({ locateFile: () => wasmUrl }).then((wasm) => {
  wasm.setup()
  return wasm
})

type Wasm = Awaited<typeof ready>

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

  const parts = req.parts.map((p) => place(wasm, p))
  const combine = { union: wasm.Manifold.union, subtract: wasm.Manifold.difference, intersect: wasm.Manifold.intersection }
  const result = combine[req.op](parts)
  try {
    if (result.isEmpty()) throw new Error(`${req.op} produced an empty solid`)
    return toSolid(result)
  } finally {
    for (const p of parts) p.delete()
    result.delete()
  }
}

self.onmessage = async (e: MessageEvent<{ id: number; req: CsgRequest }>) => {
  const { id, req } = e.data
  let res: CsgResponse
  try {
    res = { id, ok: true, result: run(await ready, req) }
  } catch (err) {
    res = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  const transfer = res.ok && !Array.isArray(res.result) ? [res.result.positions.buffer, res.result.indices.buffer] : []
  self.postMessage(res, transfer)
}
