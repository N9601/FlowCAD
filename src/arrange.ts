import * as THREE from 'three'
import type { CadDocument, SceneObject } from './document'

export type Axis = 'x' | 'y' | 'z'

const MAX_COPIES = 200

const worldBox = (obj: SceneObject) => new THREE.Box3().setFromObject(obj.mesh)

function setWorldMatrix(obj: SceneObject, matrix: THREE.Matrix4) {
  matrix.decompose(obj.mesh.position, obj.mesh.quaternion, obj.mesh.scale)
  obj.mesh.updateMatrixWorld()
}

function currentMatrix(obj: SceneObject): THREE.Matrix4 {
  obj.mesh.updateMatrix()
  return obj.mesh.matrix.clone()
}

/** Lowers or raises each object so its lowest point sits on Z = 0. */
export function dropToBed(objects: readonly SceneObject[]) {
  for (const obj of objects) obj.mesh.position.z -= worldBox(obj).min.z
}

/** Moves every other object so its bounding-box centre (or low side) matches the target's on one axis. */
export function align(target: SceneObject, others: readonly SceneObject[], axis: Axis, mode: 'centre' | 'min') {
  const pick = (box: THREE.Box3) => (mode === 'min' ? box.min[axis] : (box.min[axis] + box.max[axis]) / 2)
  const goal = pick(worldBox(target))
  for (const obj of others) obj.mesh.position[axis] += goal - pick(worldBox(obj))
}

/** Reflects each object through the plane across its own bounding-box centre. */
export function mirror(objects: readonly SceneObject[], axis: Axis) {
  for (const obj of objects) {
    const centre = worldBox(obj).getCenter(new THREE.Vector3())
    const scale = new THREE.Vector3(1, 1, 1)
    scale[axis] = -1
    const reflect = new THREE.Matrix4()
      .makeTranslation(centre.x, centre.y, centre.z)
      .scale(scale)
      .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z))
    setWorldMatrix(obj, reflect.multiply(currentMatrix(obj)))
  }
}

function checkCount(count: number) {
  if (!Number.isInteger(count) || count < 2 || count > MAX_COPIES) throw new Error(`Count must be a whole number from 2 to ${MAX_COPIES}`)
}

/** `count` includes the original. Returns the new copies. */
export function linearArray(doc: CadDocument, obj: SceneObject, count: number, step: THREE.Vector3): SceneObject[] {
  checkCount(count)
  if (step.lengthSq() === 0) throw new Error('Spacing cannot be zero on every axis')
  const base = currentMatrix(obj)
  return Array.from({ length: count - 1 }, (_, i) => {
    const offset = step.clone().multiplyScalar(i + 1)
    const copy = doc.cloneAt(obj, new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z).multiply(base))
    copy.name = `${obj.name} #${i + 2}`
    return copy
  })
}

/** Copies around the world Z axis. A full 360 degrees is divided evenly; a smaller sweep puts a copy at each end. */
export function circularArray(doc: CadDocument, obj: SceneObject, count: number, sweepDegrees: number): SceneObject[] {
  checkCount(count)
  if (sweepDegrees === 0) throw new Error('Sweep angle cannot be zero')
  const divisions = Math.abs(sweepDegrees) >= 360 ? count : count - 1
  const stepAngle = THREE.MathUtils.degToRad(sweepDegrees) / divisions
  const base = currentMatrix(obj)
  return Array.from({ length: count - 1 }, (_, i) => {
    const copy = doc.cloneAt(obj, new THREE.Matrix4().makeRotationZ(stepAngle * (i + 1)).multiply(base))
    copy.name = `${obj.name} #${i + 2}`
    return copy
  })
}
