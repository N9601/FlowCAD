import * as THREE from 'three'
import type { CadDocument } from './document'
import type { Viewport } from './viewport'

type Axis = 'x' | 'y' | 'z'

const AXIS_NORMALS: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}
const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }
const PLANE_COLOR = 0xffd24d

/**
 * Real-time slice. A THREE.Plane fed to every mesh's material.clippingPlanes hides the near side;
 * DoubleSide rendering lets the interior back faces show through so you can inspect the geometry.
 * A translucent square marks where the cut is.
 */
export function buildSectionView(toolbar: HTMLElement, view: Viewport, doc: CadDocument, status: HTMLElement) {
  view.renderer.localClippingEnabled = true
  const plane = new THREE.Plane()
  const clip: THREE.Plane[] = [plane]

  const planeVisual = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: PLANE_COLOR, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
  )
  planeVisual.renderOrder = 5
  planeVisual.visible = false
  const planeEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
    new THREE.LineBasicMaterial({ color: PLANE_COLOR }),
  )
  planeVisual.add(planeEdge)
  view.scene.add(planeVisual)

  let axis: Axis = 'z'
  let offset = 0
  let active = false

  const currentBounds = () => {
    const box = new THREE.Box3()
    for (const obj of doc.objects) box.expandByObject(obj.mesh)
    if (box.isEmpty()) box.set(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 50))
    return box
  }

  const updateMaterials = () => {
    for (const obj of doc.objects) {
      const material = obj.mesh.material
      material.clippingPlanes = active ? clip : null
      material.clipShadows = active
      // DoubleSide + clipping makes the cut interior visible; single-side gives a hollow silhouette.
      material.side = active ? THREE.DoubleSide : THREE.FrontSide
      material.needsUpdate = true
    }
  }

  const updatePlane = () => {
    plane.normal.copy(AXIS_NORMALS[axis])
    plane.constant = -offset
    const box = currentBounds()
    const size = box.getSize(new THREE.Vector3())
    const scale = Math.max(size.x, size.y, size.z) * 1.4
    const centre = box.getCenter(new THREE.Vector3())
    centre[axis] = offset
    planeVisual.position.copy(centre)
    planeVisual.scale.set(scale, scale, 1)
    planeVisual.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), plane.normal)
    planeVisual.visible = active
  }

  const controlsWrap = toolbar.appendChild(Object.assign(document.createElement('div'), { className: 'group section-controls' }))
  const toggle = controlsWrap.appendChild(Object.assign(document.createElement('button'), { textContent: 'Cross-section' }))
  const axisSelect = controlsWrap.appendChild(document.createElement('select'))
  for (const value of ['x', 'y', 'z']) axisSelect.add(new Option(value.toUpperCase(), value))
  axisSelect.value = axis
  axisSelect.hidden = true
  const slider = controlsWrap.appendChild(document.createElement('input'))
  slider.type = 'range'
  slider.step = '0.5'
  slider.hidden = true

  const syncSliderRange = () => {
    const box = currentBounds()
    const axisIndex = AXIS_INDEX[axis]
    const lo = box.min.getComponent(axisIndex)
    const hi = box.max.getComponent(axisIndex)
    slider.min = String(lo - 5)
    slider.max = String(hi + 5)
    if (offset < +slider.min || offset > +slider.max) offset = (lo + hi) / 2
    slider.value = String(offset)
  }

  const setActive = (next: boolean) => {
    active = next
    toggle.classList.toggle('active', active)
    axisSelect.hidden = !active
    slider.hidden = !active
    if (active) syncSliderRange()
    updatePlane()
    updateMaterials()
    status.textContent = active ? `Cross-section on ${axis.toUpperCase()} at ${offset.toFixed(1)} mm. Drag the slider or scroll on it.` : 'Cross-section off.'
  }

  toggle.addEventListener('click', () => setActive(!active))
  axisSelect.addEventListener('change', () => {
    axis = axisSelect.value as Axis
    syncSliderRange()
    updatePlane()
    setActive(true)
  })
  slider.addEventListener('input', () => {
    offset = slider.valueAsNumber
    updatePlane()
    status.textContent = `Cross-section on ${axis.toUpperCase()} at ${offset.toFixed(1)} mm.`
  })
  doc.addEventListener('change', () => {
    if (!active) return
    syncSliderRange()
    updatePlane()
    updateMaterials()
  })
  window.addEventListener('keydown', (e) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement
    if (typing || e.ctrlKey || e.metaKey || e.key.toLowerCase() !== 'c') return
    setActive(!active)
  })
}
