/// <reference lib="webworker" />
import Module from 'manifold-3d'
import type { Manifold, Mat4 } from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { gearProfile } from './gear'
import { bolt, nut, rod } from './thread'
import type { CsgRequest, CsgResponse, PlacedSolid, PrimitiveSpec, SolidData } from './protocol'

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

function run(wasm: Wasm, req: CsgRequest): SolidData {
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

  const a = place(wasm, req.a)
  const b = place(wasm, req.b)
  const result =
    req.op === 'union' ? wasm.Manifold.union(a, b) : req.op === 'subtract' ? a.subtract(b) : a.intersect(b)
  try {
    if (result.isEmpty()) throw new Error(`${req.op} produced an empty solid`)
    return toSolid(result)
  } finally {
    a.delete()
    b.delete()
    result.delete()
  }
}

self.onmessage = async (e: MessageEvent<{ id: number; req: CsgRequest }>) => {
  const { id, req } = e.data
  let res: CsgResponse
  try {
    res = { id, ok: true, solid: run(await ready, req) }
  } catch (err) {
    res = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  const transfer = res.ok ? [res.solid.positions.buffer, res.solid.indices.buffer] : []
  self.postMessage(res, transfer)
}
