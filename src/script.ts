import { MathUtils } from 'three'
import { addShape, chamfer, combine, fillet } from './actions'
import { dropToBed, mirror, type Axis } from './arrange'
import { CATEGORIES } from './catalog'
import type { BooleanOp, PrimitiveSpec } from './csg/protocol'
import type { CadDocument, SceneObject } from './document'
import type { Viewport } from './viewport'

/** Handle a script holds on to. Transform calls chain: `cube().at(10, 0, 0).rotate(0, 0, 45)`. */
class Part {
  readonly object: SceneObject
  private readonly doc: CadDocument

  constructor(object: SceneObject, doc: CadDocument) {
    this.object = object
    this.doc = doc
  }

  /** Independent copy in the same place; move it afterwards. */
  clone() {
    this.object.mesh.updateMatrix()
    return new Part(this.doc.cloneAt(this.object, this.object.mesh.matrix.clone()), this.doc)
  }

  mirror(axis: Axis) {
    if (!['x', 'y', 'z'].includes(axis)) throw new Error("mirror() takes 'x', 'y' or 'z'")
    mirror([this.object], axis)
    return this
  }

  /** Rests the part on the bed (Z = 0). */
  drop() {
    dropToBed([this.object])
    return this
  }

  /** Absolute position of the part's centre, in mm. */
  at(x: number, y: number, z: number) {
    this.object.mesh.position.set(x, y, z)
    return this
  }

  move(dx = 0, dy = 0, dz = 0) {
    this.object.mesh.position.x += dx
    this.object.mesh.position.y += dy
    this.object.mesh.position.z += dz
    return this
  }

  /** Absolute rotation in degrees about X, Y and Z. */
  rotate(x = 0, y = 0, z = 0) {
    this.object.mesh.rotation.set(MathUtils.degToRad(x), MathUtils.degToRad(y), MathUtils.degToRad(z))
    return this
  }

  scale(x: number, y = x, z = x) {
    if (x <= 0 || y <= 0 || z <= 0) throw new Error('scale() factors must be greater than zero')
    this.object.mesh.scale.set(x, y, z)
    return this
  }

  name(name: string) {
    this.object.name = name
    return this
  }

  /** Rounds every convex edge by `radius` mm using a Minkowski erode-then-dilate. */
  async fillet(radius: number) {
    return new Part(await fillet(this.doc, this.object, radius), this.doc)
  }

  /** Cuts every convex edge back at 45 degrees by `radius` mm. */
  async chamfer(radius: number) {
    return new Part(await chamfer(this.doc, this.object, radius), this.doc)
  }

  /** Base color as "#rrggbb" or a 0xrrggbb number. */
  color(value: string | number) {
    const hex = typeof value === 'string' ? parseInt(value.replace('#', ''), 16) : value
    if (!Number.isFinite(hex)) throw new Error('color() takes "#rrggbb" or a 0xrrggbb number')
    this.object.color = hex
    this.object.mesh.material.color.setHex(hex)
    return this
  }
}

export const STARTER_SCRIPT = `// Every shape takes an object of dimensions in mm; anything left out uses the default.
// Shapes: ${CATEGORIES.flatMap((c) => c.shapes.map((s) => s.spec.kind)).join(', ')}
// Parts:  .at(x,y,z)  .move(dx,dy,dz)  .rotate(x,y,z)  .scale(f)  .mirror('x')  .drop()  .clone()  .color('#c9a')  .name('...')
// Async:  await part.fillet(2)  await part.chamfer(1)
// Also:   union(a, b, ...)  subtract(target, ...tools)  intersect(a, b, ...)  clear()  fit()  print(...)

clear()
const plate = await roundedBox({ x: 100, y: 40, z: 6, radius: 2 })
const holes = []
for (let i = 0; i < 4; i++) {
  holes.push((await cylinder({ radius: 3.3, height: 20 })).at(-36 + i * 24, 0, 3))
}
const bracket = await subtract(plate, ...holes)
bracket.name('Bracket')
print('Holes drilled:', holes.length)
fit()
`

/**
 * Runs user code against the document. This is the user's own code in their own tab, the same
 * trust level as the browser's devtools console. The whole run is one undo step.
 */
export async function runScript(code: string, doc: CadDocument, view: Viewport, print: (line: string) => void) {
  const scope: Record<string, unknown> = {
    clear: () => doc.remove([...doc.objects]),
    fit: () => view.frame(doc.frameTargets),
    print: (...values: unknown[]) => print(values.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ')),
  }

  for (const { label, spec } of CATEGORIES.flatMap((c) => c.shapes)) {
    scope[spec.kind] = async (dimensions: Partial<PrimitiveSpec> = {}) => {
      const unknown = Object.keys(dimensions).filter((key) => !(key in spec))
      if (unknown.length > 0) {
        throw new Error(`${spec.kind}() has no "${unknown[0]}". Options: ${Object.keys(spec).filter((k) => k !== 'kind').join(', ')}`)
      }
      return new Part(await addShape(doc, label, { ...spec, ...dimensions, kind: spec.kind } as PrimitiveSpec), doc)
    }
  }

  for (const op of ['union', 'subtract', 'intersect'] satisfies BooleanOp[]) {
    scope[op] = async (...parts: Part[]) => {
      if (parts.some((p) => !(p instanceof Part))) throw new Error(`${op}() takes parts. Did you forget "await" when creating one?`)
      if (parts.some((p) => !doc.objects.includes(p.object))) throw new Error(`${op}() was given a part that is already used up`)
      return new Part(await combine(doc, op, parts.map((p) => p.object)), doc)
    }
  }

  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<void>
  try {
    await new AsyncFunction(...Object.keys(scope), code)(...Object.values(scope))
  } finally {
    doc.select([])
    doc.commit()
  }
}


/** Complex scene built from every kind of shape and boolean; used by the console's Showcase button. */
export const SHOWCASE_SCRIPT = `// FlowCAD showcase: planetary gear plinth
clear()

// Rounded plinth with 4 counterbored bolt holes and an engraved rim
const plinth = await roundedBox({ x: 180, y: 180, z: 12, radius: 5 })
const holes = []
for (let i = 0; i < 4; i++) {
  const a = Math.PI / 4 + i * Math.PI / 2
  const x = Math.cos(a) * 78, y = Math.sin(a) * 78
  holes.push((await cylinder({ radius: 3.5, height: 30, segments: 32 })).at(x, y, 6))
  holes.push((await cylinder({ radius: 6, height: 5, segments: 32 })).at(x, y, 11))
}
const label = (await text({ text: 'FLOWCAD', letterHeight: 8, thickness: 3 })).at(0, -74, 12).rotate(0, 0, 180)
;(await subtract(plinth, ...holes, label)).name('Plinth')

// Ring gear: a large spur gear with its centre cored out
const ringBlank = await gear({ module: 2, teeth: 60, thickness: 10, bore: 0 })
const ringBore = (await cylinder({ radius: 54, height: 20, segments: 128 })).at(0, 0, 5)
;(await subtract(ringBlank, ringBore)).at(0, 0, 15).name('Ring gear')

// Sun gear with hub and domed cap
;(await gear({ module: 2, teeth: 22, thickness: 10, bore: 8 })).at(0, 0, 15).name('Sun gear')
;(await cylinder({ radius: 12, height: 4, segments: 48 })).at(0, 0, 22).name('Sun hub')
;(await dome({ radius: 10, segments: 48 })).at(0, 0, 24).name('Cap')

// Three planet gears at 120 degrees
for (let i = 0; i < 3; i++) {
  const a = i * 2 * Math.PI / 3
  ;(await gear({ module: 2, teeth: 20, thickness: 10, bore: 5 })).at(Math.cos(a) * 44, Math.sin(a) * 44, 15).name('Planet ' + (i + 1))
}

// M8 bolts in the corner counterbores
for (let i = 0; i < 4; i++) {
  const a = Math.PI / 4 + i * Math.PI / 2
  ;(await bolt({ size: 8, length: 18 })).at(Math.cos(a) * 78, Math.sin(a) * 78, 12).name('Bolt ' + (i + 1))
}

// Belt pulley on a threaded shaft along the front edge
;(await pulley({ diameter: 32, width: 14, grooveDepth: 5, bore: 6 })).at(78, -60, 6).rotate(90, 0, 0).name('Pulley')
;(await rod({ size: 8, length: 60 })).at(78, -60, 6).rotate(90, 0, 0).name('Shaft')

// Twisted star spire as an ornamental accent
const star = '10,0 4,3 8,10 0,4 -8,10 -4,3 -10,0 -4,-3 -8,-10 0,-4 8,-10 4,-3'
;(await extrude({ profile: star, height: 60, twist: 180 })).at(-78, -60, 30).name('Spire')

fit()
`


/** Multi-landmark architectural showcase; used by the console's Architecture button. */
export const SHOWCASE_ARCH_SCRIPT = `clear()

// ================= Plaza =================
const plaza = await roundedBox({ x: 340, y: 220, z: 8, radius: 3, segments: 32 })
const label = (await text({ text: 'FLOWCAD METROPOLIS', letterHeight: 10, thickness: 3 })).at(0, -104, 8)
;(await subtract(plaza, label)).name('Plaza').drop()

// ================= Twisted skyscraper (left) =================
// Extrude height 170; centred, so half-height is 85 above the base at Z = 8.
const star = '18,0 7,5 14,17 0,6 -14,17 -7,5 -18,0 -7,-5 -14,-17 0,-6 14,-17 7,-5'
;(await extrude({ profile: star, height: 170, twist: 220 })).at(-125, 0, 93).name('Torso tower')
;(await cylinder({ radius: 12, height: 6, segments: 64 })).at(-125, 0, 181).name('Torso ring')
;(await cone({ radius: 10, height: 30, segments: 48 })).at(-125, 0, 199).name('Torso spire')

// ================= Classical temple (centre) =================
;(await roundedBox({ x: 70, y: 50, z: 4, radius: 1, segments: 24 })).at(0, 0, 10).name('Stylobate')
for (let i = 0; i < 4; i++) {
  const x = -22.5 + i * 15
  ;(await cylinder({ radius: 2.5, height: 20, segments: 32 })).at(x, -20, 22).name('Column F' + (i + 1))
  ;(await cylinder({ radius: 2.5, height: 20, segments: 32 })).at(x, 20, 22).name('Column B' + (i + 1))
}
;(await roundedBox({ x: 70, y: 50, z: 4, radius: 1, segments: 24 })).at(0, 0, 34).name('Entablature')
;(await extrude({ profile: '-35,0 35,0 0,12', height: 50 })).at(0, 0, 42).rotate(90, 0, 0).name('Pediment')

// Staircase in front of the temple; widest at the bottom
for (let i = 0; i < 4; i++) {
  const above = 3 - i
  const width = 70 + above * 4
  ;(await cube({ x: width, y: 4, z: 1.5 })).at(0, -25 - i * 3, 8 + above * 1.5 + 0.75).name('Step ' + (i + 1))
}

// ================= Domed rotunda (right) =================
;(await cylinder({ radius: 26, height: 24, segments: 96 })).at(125, 0, 20).name('Drum')
for (let i = 0; i < 12; i++) {
  const angle = i * 2 * Math.PI / 12
  ;(await cube({ x: 2, y: 4, z: 24 })).at(125 + Math.cos(angle) * 26.5, Math.sin(angle) * 26.5, 20).rotate(0, 0, angle * 180 / Math.PI).name('Pilaster ' + (i + 1))
}
;(await dome({ radius: 26, segments: 96 })).at(125, 0, 32).name('Dome')
;(await sphere({ radius: 4, segments: 48 })).at(125, 0, 61).name('Finial')

for (let i = 0; i < 4; i++) {
  const angle = Math.PI / 4 + i * Math.PI / 2
  const x = 125 + Math.cos(angle) * 40
  const y = Math.sin(angle) * 40
  ;(await cylinder({ radius: 2, height: 50, segments: 24 })).at(x, y, 33).name('Minaret ' + (i + 1))
  ;(await cone({ radius: 3.5, height: 10, segments: 24 })).at(x, y, 63).name('Minaret cap ' + (i + 1))
  ;(await sphere({ radius: 1.5, segments: 20 })).at(x, y, 70).name('Minaret bead ' + (i + 1))
}

// ================= Fountain (front-centre) =================
;(await cylinder({ radius: 12, height: 3, segments: 48 })).at(0, 80, 9.5).name('Fountain basin')
;(await torus({ majorRadius: 14, minorRadius: 2, segments: 64 })).at(0, 80, 11).name('Fountain rim')
;(await cylinder({ radius: 2, height: 12, segments: 24 })).at(0, 80, 17).name('Fountain jet')
;(await sphere({ radius: 4, segments: 32 })).at(0, 80, 25).name('Fountain crown')

// ================= Windmill (back-left) =================
;(await cylinder({ radius: 6, height: 30, segments: 24 })).at(-115, -80, 23).name('Mill tower')
;(await dome({ radius: 6, segments: 24 })).at(-115, -80, 38).name('Mill cap')
;(await gear({ module: 1.2, teeth: 24, thickness: 1.5, bore: 3 })).at(-100, -80, 40).rotate(0, 90, 0).name('Mill wheel')
;(await cylinder({ radius: 1, height: 12, segments: 12 })).at(-108, -80, 40).rotate(0, 90, 0).name('Mill shaft')

// ================= Decorative gears (right-back) =================
;(await gear({ module: 1.5, teeth: 30, thickness: 3, bore: 5 })).at(90, 85, 10).name('Gear big')
;(await gear({ module: 1.5, teeth: 20, thickness: 3, bore: 4 })).at(60, 85, 10).name('Gear small')
;(await bolt({ size: 6, length: 20 })).at(90, 85, 11.5).name('Gear bolt')

// ================= Corner bollards =================
for (let i = 0; i < 4; i++) {
  const x = i % 2 === 0 ? -160 : 160
  const y = i < 2 ? -100 : 100
  ;(await capsule({ radius: 3, length: 20, segments: 24 })).at(x, y, 18).name('Bollard ' + (i + 1))
}

fit()
`


/** Mechanical assembly showcase: housing, gears, spring, pipe, pulley. */
export const SHOWCASE_MECH_SCRIPT = `clear()

// Base plate with mounting holes and a big through-bore
const base = await roundedBox({ x: 180, y: 120, z: 10, radius: 4 })
const bore = (await cylinder({ radius: 18, height: 30 })).at(0, 0, 5)
const holes = []
for (const [x, y] of [[-70, -40], [70, -40], [-70, 40], [70, 40]]) {
  holes.push((await cylinder({ radius: 4, height: 20 })).at(x, y, 5))
}
;(await subtract(base, bore, ...holes)).name('Base').color('#7a8a99')

// Rounded gear housing on top of the base
const housing = await cube({ x: 60, y: 60, z: 30 })
const roundedHousing = (await housing.fillet(6)).at(0, 0, 25).color('#8899aa').name('Housing')
const window1 = (await cube({ x: 40, y: 62, z: 20 })).at(0, 0, 26)
const finalHousing = (await subtract(roundedHousing, window1)).color('#8899aa').name('Gear housing')

// Meshed spur gears inside the window
;(await gear({ module: 2, teeth: 20, thickness: 8, bore: 5 })).at(-10, 0, 25).color('#c0864a').name('Drive gear')
;(await gear({ module: 2, teeth: 12, thickness: 8, bore: 4 })).at(22, 0, 25).color('#c0864a').name('Driven gear')

// Two bearing hubs projecting from the housing
for (const x of [-10, 22]) {
  ;(await cylinder({ radius: 6, height: 6, segments: 48 })).at(x, 30, 25).rotate(90, 0, 0).color('#334455').name('Hub ' + (x < 0 ? 'L' : 'R'))
}

// Four M8 bolts standing in the corner holes
for (const [x, y] of [[-70, -40], [70, -40], [-70, 40], [70, 40]]) {
  ;(await bolt({ size: 8, length: 22 })).at(x, y, 10).name('Bolt ' + x + ',' + y)
}

// A tall coil spring on the side platform
;(await roundedBox({ x: 40, y: 40, z: 6, radius: 2 })).at(-110, 0, 13).color('#556677').name('Platform')
;(await spring({ coilRadius: 10, wireRadius: 1.5, pitch: 5, turns: 8, segments: 24 })).at(-110, 0, 16).color('#c9c9c9').name('Coil spring')
;(await cylinder({ radius: 8, height: 3, segments: 48 })).at(-110, 0, 59).color('#334455').name('Spring cap')

// Bent hydraulic pipe snaking between the housing and the platform
;(await pipe({ path: '-90,0,20 -60,0,20 -60,20,20 -30,20,20 -30,20,45', radius: 2.5, segments: 24 })).color('#4d6478').name('Hydraulic line')

// Threaded rod driving the pulley up top
;(await pulley({ diameter: 34, width: 14, grooveDepth: 5, bore: 6 })).at(100, 0, 18).rotate(90, 0, 0).color('#c9c9c9').name('Drive pulley')
;(await rod({ size: 6, length: 40 })).at(100, 0, 18).rotate(90, 0, 0).color('#c9c9c9').name('Rod')

// Domed inspection cap on the housing
;(await arcSphere({ radius: 10, startZ: 0, endZ: 10, segments: 48 })).at(0, 0, 40).color('#a08050').name('Inspection cap')

// Engraved model number
const plate = (await cube({ x: 60, y: 12, z: 1.5 })).at(0, -50, 11.25).color('#dbdbdb')
const stamp = (await text({ text: 'FLOWCAD MK-II', letterHeight: 5, thickness: 1 })).at(0, -50, 11.25)
;(await subtract(plate, stamp)).name('Nameplate').color('#dbdbdb')

fit()
`
