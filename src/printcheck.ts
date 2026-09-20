import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import type { SceneObject } from './document'

export interface PrintSettings {
  /** Steepest printable overhang, in degrees from vertical. */
  overhangAngle: number
  /** Thinnest wall that prints reliably, in mm. */
  minWall: number
  bed: { x: number; y: number; z: number }
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  overhangAngle: 45,
  minWall: 0.8,
  bed: { x: 220, y: 220, z: 250 },
}

export const FLAG_OVERHANG = 1
export const FLAG_THIN = 2

export interface PrintReport {
  /** One entry per triangle of the object's solid: a bitmask of FLAG_* values. */
  flags: Uint8Array
  overhangArea: number
  thinArea: number
  contactArea: number
  /** Height of the lowest point above the bed; negative when the part dips below it. */
  bedGap: number
  size: THREE.Vector3
  volume: number
  issues: string[]
}

const BED_TOLERANCE = 0.05
const MAX_THICKNESS_SAMPLES = 20000
const PLA_DENSITY = 1.24 // g/cm3

export const plaGrams = (volumeMm3: number) => (volumeMm3 / 1000) * PLA_DENSITY

export function analyse(obj: SceneObject, settings: PrintSettings): PrintReport {
  obj.mesh.updateMatrixWorld()
  const { indices } = obj.solid
  const triangles = indices.length / 3

  // Everything is measured in world space so rotation and non-uniform scale are handled.
  const world = new Float32Array(obj.solid.positions.length)
  const v = new THREE.Vector3()
  for (let i = 0; i < world.length; i += 3) {
    v.fromArray(obj.solid.positions, i).applyMatrix4(obj.mesh.matrixWorld).toArray(world, i)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(world, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  const bvh = new MeshBVH(geometry)
  const box = new THREE.Box3().setFromArray(world)

  const flags = new Uint8Array(triangles)
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const normal = new THREE.Vector3()
  const centroid = new THREE.Vector3()
  const ray = new THREE.Ray()
  const overhangLimit = -Math.sin(THREE.MathUtils.degToRad(settings.overhangAngle))
  const stride = Math.max(1, Math.ceil(triangles / MAX_THICKNESS_SAMPLES))

  let overhangArea = 0
  let thinArea = 0
  let contactArea = 0
  let volume = 0

  for (let t = 0; t < triangles; t++) {
    a.fromArray(world, indices[t * 3] * 3)
    b.fromArray(world, indices[t * 3 + 1] * 3)
    c.fromArray(world, indices[t * 3 + 2] * 3)
    volume += a.dot(normal.crossVectors(b, c)) / 6
    normal.subVectors(b, a).cross(centroid.subVectors(c, a))
    const area = normal.length() / 2
    if (area < 1e-9) continue
    normal.normalize()
    centroid.copy(a).add(b).add(c).divideScalar(3)

    const onBed = normal.z < -0.999 && centroid.z - box.min.z < BED_TOLERANCE
    if (onBed) contactArea += area
    else if (normal.z < overhangLimit) {
      flags[t] |= FLAG_OVERHANG
      overhangArea += area
    }

    if (t % stride === 0) {
      ray.origin.copy(centroid).addScaledVector(normal, -1e-3)
      ray.direction.copy(normal).negate()
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide)
      if (hit && hit.distance < settings.minWall) {
        flags[t] |= FLAG_THIN
        thinArea += area * stride
      }
    }
  }
  geometry.dispose()

  const size = box.getSize(new THREE.Vector3())
  const bedGap = box.min.z
  const issues: string[] = []
  if (size.x > settings.bed.x || size.y > settings.bed.y || size.z > settings.bed.z) {
    issues.push(`Too big for the ${settings.bed.x} x ${settings.bed.y} x ${settings.bed.z} mm build volume`)
  }
  if (bedGap > BED_TOLERANCE) issues.push(`Floating ${bedGap.toFixed(2)} mm above the bed`)
  if (bedGap < -BED_TOLERANCE) issues.push(`Extends ${(-bedGap).toFixed(2)} mm below the bed`)
  if (contactArea < 25) issues.push(`Only ${contactArea.toFixed(1)} mm2 touches the bed: add a brim or reorient`)
  if (overhangArea > 1) issues.push(`${overhangArea.toFixed(0)} mm2 of overhang steeper than ${settings.overhangAngle} degrees needs support`)
  if (thinArea > 1) issues.push(`${thinArea.toFixed(0)} mm2 of surface is on walls thinner than ${settings.minWall} mm`)

  return { flags, overhangArea, thinArea, contactArea, bedGap, size, volume: Math.abs(volume), issues }
}

/** Geometry holding only the flagged triangles, in the object's local space, coloured by issue. */
export function flaggedGeometry(obj: SceneObject, flags: Uint8Array): THREE.BufferGeometry | undefined {
  const { positions, indices } = obj.solid
  const points: number[] = []
  const colors: number[] = []
  for (let t = 0; t < flags.length; t++) {
    if (flags[t] === 0) continue
    const color = flags[t] & FLAG_OVERHANG ? [1, 0.25, 0.2] : [1, 0.7, 0.1]
    for (let k = 0; k < 3; k++) {
      const i = indices[t * 3 + k] * 3
      points.push(positions[i], positions[i + 1], positions[i + 2])
      colors.push(...color)
    }
  }
  if (points.length === 0) return undefined
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geometry
}
