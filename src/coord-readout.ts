import * as THREE from 'three'
import type { CadDocument } from './document'
import { formatLength } from './units'
import type { Viewport } from './viewport'

/**
 * Overlay in the top-left of the viewport that follows the mouse: shows XY on the ground plane,
 * or XYZ when the cursor is over an object mesh.
 */
export function buildCoordReadout(scene: HTMLElement, view: Viewport, doc: CadDocument) {
  const overlay = scene.appendChild(Object.assign(document.createElement('div'), { className: 'coord-readout' }))
  overlay.textContent = ''

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  const hit = new THREE.Vector3()

  scene.addEventListener('mousemove', (e) => {
    const rect = scene.getBoundingClientRect()
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(ndc, view.camera)

    const meshes = doc.objects.filter((o) => o.visible).map((o) => o.mesh)
    const meshHit = raycaster.intersectObjects(meshes, false)[0]
    if (meshHit) {
      const p = meshHit.point
      overlay.textContent = `X ${formatLength(p.x)}  Y ${formatLength(p.y)}  Z ${formatLength(p.z)}`
      return
    }
    if (raycaster.ray.intersectPlane(ground, hit)) {
      overlay.textContent = `X ${formatLength(hit.x)}  Y ${formatLength(hit.y)}`
    } else {
      overlay.textContent = ''
    }
  })

  scene.addEventListener('mouseleave', () => {
    overlay.textContent = ''
  })
}
