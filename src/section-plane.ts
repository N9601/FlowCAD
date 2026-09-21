import * as THREE from 'three'
import type { CadDocument } from './document'
import type { Viewport } from './viewport'

/**
 * A horizontal clipping plane: everything above `z` is hidden from the renderer, letting the
 * viewer see interior features. A translucent quad visualises the cut level.
 */
export class SectionPlane {
  /** Normal points down (0,0,-1); keeps points where -z + constant >= 0, i.e. z <= constant. */
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 200)
  private readonly visual: THREE.Mesh
  private enabled = false
  private readonly doc: CadDocument

  constructor(view: Viewport, doc: CadDocument) {
    this.doc = doc
    view.renderer.localClippingEnabled = true

    this.visual = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshBasicMaterial({
        color: 0x4da3ff,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    this.visual.position.z = 200
    this.visual.visible = false
    view.scene.add(this.visual)

    doc.addEventListener('change', () => this.apply())
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getZ(): number {
    return this.plane.constant
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.visual.visible = on
    this.apply()
  }

  setZ(z: number) {
    this.plane.constant = z
    this.visual.position.z = z
  }

  private apply() {
    const planes = this.enabled ? [this.plane] : []
    for (const o of this.doc.objects) {
      const m = o.mesh.material as THREE.Material
      m.clippingPlanes = planes
    }
  }
}

/** Attach the section clip UI: a toggle plus a Z slider that moves the cut. */
export function buildSectionClip(toolbar: HTMLElement, view: Viewport, doc: CadDocument, status: HTMLElement) {
  const clip = new SectionPlane(view, doc)
  const group = toolbar.appendChild(Object.assign(document.createElement('div'), { className: 'group' }))
  const toggle = group.appendChild(Object.assign(document.createElement('button'), { textContent: 'Section clip' }))
  const field = group.appendChild(Object.assign(document.createElement('label'), { className: 'field', textContent: 'Z' }))
  const slider = field.appendChild(document.createElement('input'))
  slider.type = 'range'
  slider.min = '-50'
  slider.max = '400'
  slider.step = '1'
  slider.value = '200'
  slider.disabled = true
  slider.style.width = '120px'
  toggle.addEventListener('click', () => {
    const on = !clip.isEnabled()
    clip.setEnabled(on)
    toggle.classList.toggle('active', on)
    slider.disabled = !on
    status.textContent = on ? `Section clip: keeping z ≤ ${clip.getZ()} mm` : 'Section clip off'
  })
  slider.addEventListener('input', () => {
    const z = +slider.value
    clip.setZ(z)
    status.textContent = `Section clip: keeping z ≤ ${z} mm`
  })
}
