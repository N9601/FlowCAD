import * as CANNON from 'cannon-es'
import * as THREE from 'three'
import type { CadDocument, SceneObject } from './document'

const STEP_HZ = 60
const SETTLE_SECONDS = 3
const REST_LINEAR = 0.02
const REST_ANGULAR = 0.02

/**
 * Runs a short gravity simulation on the visible objects using box-shaped rigid bodies (fast enough
 * for interactive use). Every part rests on the ground plane and stacks/collides with the others.
 * Applies the final resting transforms back to the document as one undo step.
 */
export async function settleWithPhysics(doc: CadDocument): Promise<void> {
  const active = doc.objects.filter((o) => o.visible)
  if (active.length === 0) return

  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, -9810) })
  world.defaultContactMaterial.friction = 0.4
  world.defaultContactMaterial.restitution = 0
  world.addBody(new CANNON.Body({ mass: 0, shape: new CANNON.Plane() }))

  const bodies: { obj: SceneObject; body: CANNON.Body; anchor: THREE.Vector3 }[] = []
  const size = new THREE.Vector3()
  for (const obj of active) {
    obj.mesh.updateMatrixWorld()
    const box = new THREE.Box3().setFromObject(obj.mesh)
    box.getSize(size)
    const centre = box.getCenter(new THREE.Vector3())
    const anchor = centre.clone().sub(obj.mesh.position) // offset from mesh origin to bbox centre in world
    const halfExtents = new CANNON.Vec3(Math.max(0.1, size.x / 2), Math.max(0.1, size.y / 2), Math.max(0.1, size.z / 2))
    const body = new CANNON.Body({ mass: size.x * size.y * size.z, shape: new CANNON.Box(halfExtents) })
    body.position.set(centre.x, centre.y, centre.z)
    const q = new THREE.Quaternion().setFromEuler(obj.mesh.rotation)
    body.quaternion.set(q.x, q.y, q.z, q.w)
    world.addBody(body)
    bodies.push({ obj, body, anchor })
  }

  return new Promise((resolve) => {
    const dt = 1 / STEP_HZ
    let elapsed = 0
    const apply = () => {
      for (const { obj, body, anchor } of bodies) {
        const q = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
        const centre = new THREE.Vector3(body.position.x, body.position.y, body.position.z)
        // Rotate the mesh-origin-to-bbox offset into the current orientation, then subtract.
        const rotatedAnchor = anchor.clone().applyQuaternion(q)
        obj.mesh.position.copy(centre).sub(rotatedAnchor)
        obj.mesh.setRotationFromQuaternion(q)
      }
      doc.dispatchEvent(new Event('transform'))
    }
    const allResting = () =>
      bodies.every(({ body }) => body.velocity.length() < REST_LINEAR && body.angularVelocity.length() < REST_ANGULAR)
    const tick = () => {
      world.step(dt)
      elapsed += dt
      apply()
      if (elapsed >= SETTLE_SECONDS || allResting()) {
        doc.commit()
        resolve()
        return
      }
      // setTimeout keeps ticking even when the pane is hidden; rAF gets throttled there.
      setTimeout(tick, 1000 / STEP_HZ)
    }
    setTimeout(tick, 0)
  })
}
