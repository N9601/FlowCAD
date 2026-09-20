import { MathUtils } from 'three'
import { addShape, combine } from './actions'
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
}

export const STARTER_SCRIPT = `// Every shape takes an object of dimensions in mm; anything left out uses the default.
// Shapes: ${CATEGORIES.flatMap((c) => c.shapes.map((s) => s.spec.kind)).join(', ')}
// Parts:  .at(x,y,z)  .move(dx,dy,dz)  .rotate(x,y,z)  .scale(f)  .mirror('x')  .drop()  .clone()  .name('...')
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
