import { Matrix4 } from 'three'
import { checkSpec } from './catalog'
import { csg } from './csg/client'
import type { BooleanOp, CsgNode, PrimitiveSpec } from './csg/protocol'

const IDENTITY = new Matrix4().toArray()
import type { CadDocument, SceneObject } from './document'

// Neither action records an undo step, so callers can group several into one.

export async function addShape(doc: CadDocument, label: string, spec: PrimitiveSpec): Promise<SceneObject> {
  checkSpec(spec)
  return doc.add(label, await csg.primitive(spec), spec)
}

/** Rounds every convex edge by `radius` mm (fillet) or cuts it back at 45 degrees (chamfer). */
export async function roundEdges(doc: CadDocument, obj: SceneObject, op: 'fillet' | 'chamfer', radius: number): Promise<SceneObject> {
  if (radius <= 0) throw new Error(`${op} radius must be greater than zero`)
  const label = `${op[0].toUpperCase()}${op.slice(1)}`
  const tree: CsgNode = { name: `${label} ${radius}mm`, op, radius, children: [doc.nodeOf(obj)], matrix: IDENTITY }
  const solid = await csg.evaluate(tree)
  doc.remove([obj])
  const result = doc.add(label, solid)
  result.tree = { ...tree, matrix: new Matrix4().setPosition(result.mesh.position.clone().negate()).toArray() }
  return result
}

export const fillet = (doc: CadDocument, obj: SceneObject, radius: number) => roundEdges(doc, obj, 'fillet', radius)
export const chamfer = (doc: CadDocument, obj: SceneObject, radius: number) => roundEdges(doc, obj, 'chamfer', radius)

/** Replaces the inputs with their boolean result. Subtract removes every later input from the first. */
export async function combine(doc: CadDocument, op: BooleanOp, inputs: readonly SceneObject[]): Promise<SceneObject> {
  if (inputs.length < 2) throw new Error(`${op} needs at least two objects`)
  const label = `${op[0].toUpperCase()}${op.slice(1)}`
  const tree: CsgNode = { name: label, op, children: inputs.map((o) => doc.nodeOf(o)), matrix: new Matrix4().toArray() }
  const solid = await csg.evaluate(tree)
  doc.remove(inputs)
  const result = doc.add(label, solid)
  // add() moved the pivot to the bounding-box centre; shift the tree into that local frame.
  result.tree = { ...tree, matrix: new Matrix4().setPosition(result.mesh.position.clone().negate()).toArray() }
  return result
}
