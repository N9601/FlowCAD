import * as THREE from 'three'
import type { CadDocument } from './document'
import type { Viewport } from './viewport'

const CLICK_SLOP_PX = 4
const SNAP_PX = 12
const COLOR = 0xffd24d

export function buildMeasure(toolbar: HTMLElement, view: Viewport, doc: CadDocument, status: HTMLElement) {
  const dom = view.renderer.domElement
  const points: THREE.Vector3[] = []

  // Drawn on top of everything so the measurement is never hidden inside the part.
  const material = new THREE.LineBasicMaterial({ color: COLOR, depthTest: false })
  const line = new THREE.Line(new THREE.BufferGeometry(), material)
  line.renderOrder = 10
  line.visible = false
  const markerGeometry = new THREE.SphereGeometry(1, 12, 8)
  const markerMaterial = new THREE.MeshBasicMaterial({ color: COLOR, depthTest: false })
  const markers = [0, 1].map(() => {
    const marker = new THREE.Mesh(markerGeometry, markerMaterial)
    marker.renderOrder = 10
    marker.visible = false
    return marker
  })
  view.scene.add(line, ...markers)

  const label = dom.parentElement!.appendChild(Object.assign(document.createElement('div'), { className: 'measure-label', hidden: true }))

  const toScreen = (p: THREE.Vector3) => {
    const rect = dom.getBoundingClientRect()
    const ndc = p.clone().project(view.camera)
    return new THREE.Vector2(((ndc.x + 1) / 2) * rect.width, ((1 - ndc.y) / 2) * rect.height)
  }

  const redraw = () => {
    markers.forEach((marker, i) => {
      marker.visible = i < points.length
      if (!marker.visible) return
      marker.position.copy(points[i])
      // Constant size on screen, whatever the zoom.
      marker.scale.setScalar(view.camera.position.distanceTo(points[i]) * 0.006)
    })
    line.visible = points.length === 2
    label.hidden = points.length !== 2
    if (points.length !== 2) return
    line.geometry.setFromPoints(points)
    const mid = toScreen(points[0].clone().lerp(points[1], 0.5))
    label.style.left = `${mid.x}px`
    label.style.top = `${mid.y}px`
  }

  const reset = () => {
    points.length = 0
    redraw()
  }

  /** The surface point under the cursor, snapped to a triangle corner when one is close on screen. */
  const pick = (e: PointerEvent): THREE.Vector3 | undefined => {
    const rect = dom.getBoundingClientRect()
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndc, view.camera)
    const hit = raycaster.intersectObjects(doc.objects.map((o) => o.mesh), false)[0]
    if (!hit?.face) return undefined

    const cursor = new THREE.Vector2(e.clientX - rect.left, e.clientY - rect.top)
    const position = (hit.object as THREE.Mesh).geometry.getAttribute('position')
    let best = hit.point
    let bestDistance = SNAP_PX
    for (const index of [hit.face.a, hit.face.b, hit.face.c]) {
      const corner = new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(hit.object.matrixWorld)
      const distance = toScreen(corner).distanceTo(cursor)
      if (distance < bestDistance) {
        best = corner
        bestDistance = distance
      }
    }
    return best
  }

  const toggle = toolbar
    .appendChild(Object.assign(document.createElement('div'), { className: 'group' }))
    .appendChild(Object.assign(document.createElement('button'), { textContent: 'Measure (M)' }))
  let active = false
  const setActive = (next: boolean) => {
    active = next
    doc.pickingEnabled = !next
    toggle.classList.toggle('active', next)
    dom.style.cursor = next ? 'crosshair' : ''
    reset()
    if (next) {
      doc.select([])
      status.textContent = 'Measure: click two points on a model. Clicks snap to nearby corners.'
    }
  }
  toggle.addEventListener('click', () => setActive(!active))

  const down = new THREE.Vector2()
  dom.addEventListener('pointerdown', (e) => down.set(e.clientX, e.clientY))
  dom.addEventListener('pointerup', (e) => {
    if (!active || e.button !== 0 || down.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > CLICK_SLOP_PX) return
    const point = pick(e)
    if (!point) return
    if (points.length === 2) points.length = 0
    points.push(point)
    if (points.length === 2) {
      const d = points[1].clone().sub(points[0])
      label.textContent = `${d.length().toFixed(2)} mm`
      status.textContent = `Distance ${d.length().toFixed(2)} mm  (dX ${Math.abs(d.x).toFixed(2)}, dY ${Math.abs(d.y).toFixed(2)}, dZ ${Math.abs(d.z).toFixed(2)})`
    } else {
      status.textContent = 'Measure: click the second point.'
    }
    redraw()
  })

  view.controls.addEventListener('change', redraw)
  doc.addEventListener('change', () => {
    if (active && points.length > 0) reset()
  })
  window.addEventListener('keydown', (e) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement
    if (typing || e.ctrlKey || e.metaKey) return
    if (e.key.toLowerCase() === 'm') setActive(!active)
    else if (e.key === 'Escape' && active) setActive(false)
  })
}
