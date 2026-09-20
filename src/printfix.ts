import * as THREE from 'three'
import type { SceneObject } from './document'
import type { PrintSettings } from './printcheck'

// Six ways to lay a part flat: rotate so each face of a cube points down.
const ORIENTATIONS: THREE.Quaternion[] = [
  new THREE.Quaternion(),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0)),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)),
]

const BED_TOLERANCE = 0.05
/** Only pick a new orientation if it beats the current one by more than this in mm^2. */
const REORIENT_MARGIN = 25

interface Score {
  contact: number
  overhang: number
}

/** Rates one orientation by bed contact and support-needing overhang, without touching the object. */
function score(obj: SceneObject, extra: THREE.Quaternion, overhangAngle: number): Score {
  const { positions, indices } = obj.solid
  const worldMatrix = new THREE.Matrix4()
    .compose(obj.mesh.position, obj.mesh.quaternion.clone().premultiply(extra), obj.mesh.scale)
  const world = new Float32Array(positions.length)
  const v = new THREE.Vector3()
  let minZ = Infinity
  for (let i = 0; i < world.length; i += 3) {
    v.fromArray(positions, i).applyMatrix4(worldMatrix).toArray(world, i)
    if (world[i + 2] < minZ) minZ = world[i + 2]
  }

  const overhangLimit = -Math.sin(THREE.MathUtils.degToRad(overhangAngle))
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const normal = new THREE.Vector3()
  const edge = new THREE.Vector3()
  let contact = 0
  let overhang = 0
  for (let t = 0; t < indices.length; t += 3) {
    a.fromArray(world, indices[t] * 3)
    b.fromArray(world, indices[t + 1] * 3)
    c.fromArray(world, indices[t + 2] * 3)
    normal.subVectors(b, a).cross(edge.subVectors(c, a))
    const area = normal.length() / 2
    if (area < 1e-9) continue
    const nz = normal.z / (2 * area)
    const centroidZ = (a.z + b.z + c.z) / 3
    if (nz < -0.999 && centroidZ - minZ < BED_TOLERANCE) contact += area
    else if (nz < overhangLimit) overhang += area
  }
  return { contact, overhang }
}

/** Chooses the flattest orientation (best bed contact minus overhang), and applies it if worth it. */
export function autoOrient(obj: SceneObject, settings: PrintSettings): boolean {
  const scores = ORIENTATIONS.map((q) => ({ q, s: score(obj, q, settings.overhangAngle) }))
  const value = (s: Score) => s.contact - s.overhang * 0.5
  const current = scores[0]
  const best = scores.reduce((a, b) => (value(b.s) > value(a.s) ? b : a))
  if (best === current || value(best.s) - value(current.s) < REORIENT_MARGIN) return false
  obj.mesh.quaternion.premultiply(best.q)
  return true
}

/** Shrinks the part uniformly until it fits the build volume with a 2 percent margin. */
export function fitToBed(obj: SceneObject, settings: PrintSettings): boolean {
  obj.mesh.updateMatrixWorld()
  const size = new THREE.Box3().setFromObject(obj.mesh).getSize(new THREE.Vector3())
  const ratio = Math.min(1, settings.bed.x / size.x, settings.bed.y / size.y, settings.bed.z / size.z)
  if (ratio > 0.999) return false
  obj.mesh.scale.multiplyScalar(ratio * 0.98)
  return true
}

/** Lowers the part so its lowest point sits on Z = 0. */
export function dropToBed(obj: SceneObject): boolean {
  obj.mesh.updateMatrixWorld()
  const min = new THREE.Box3().setFromObject(obj.mesh).min.z
  if (Math.abs(min) < BED_TOLERANCE) return false
  obj.mesh.position.z -= min
  return true
}

export interface FixResult {
  reoriented: boolean
  scaled: boolean
  dropped: boolean
}

/** Runs every automatic fix on one object; the caller commits an undo step afterwards. */
export function autoFix(obj: SceneObject, settings: PrintSettings): FixResult {
  const reoriented = autoOrient(obj, settings)
  const scaled = fitToBed(obj, settings)
  const dropped = dropToBed(obj)
  return { reoriented, scaled, dropped }
}
