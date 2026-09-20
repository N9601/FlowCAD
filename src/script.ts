import { MathUtils } from 'three'
import { addShape, combine } from './actions'
import { CATEGORIES } from './catalog'
import type { BooleanOp, PrimitiveSpec } from './csg/protocol'
import type { CadDocument, SceneObject } from './document'
import type { Viewport } from './viewport'

/** Handle a script holds on to. Transform calls chain: `cube().at(10, 0, 0).rotate(0, 0, 45)`. */
class Part {
  readonly object: SceneObject

  constructor(object: SceneObject) {
    this.object = object
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
// Parts:  .at(x,y,z)  .move(dx,dy,dz)  .rotate(x,y,z)  .scale(f)  .name('...')
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
      return new Part(await addShape(doc, label, { ...spec, ...dimensions, kind: spec.kind } as PrimitiveSpec))
    }
  }

  for (const op of ['union', 'subtract', 'intersect'] satisfies BooleanOp[]) {
    scope[op] = async (...parts: Part[]) => {
      if (parts.some((p) => !(p instanceof Part))) throw new Error(`${op}() takes parts. Did you forget "await" when creating one?`)
      if (parts.some((p) => !doc.objects.includes(p.object))) throw new Error(`${op}() was given a part that is already used up`)
      return new Part(await combine(doc, op, parts.map((p) => p.object)))
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
