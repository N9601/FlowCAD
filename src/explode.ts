import * as THREE from 'three'
import type { CadDocument, SceneObject } from './document'

interface Anchor {
  obj: SceneObject
  origin: THREE.Vector3
  offset: THREE.Vector3
}

/**
 * Adds an "Explode" slider to the toolbar. Moving it 0 to 100 slides every object outwards from the
 * scene's centroid along its own offset direction so assembly parts separate cleanly for inspection.
 * At 0 the objects return exactly where they were captured; the anchors refresh whenever the scene
 * changes so exploding, editing and re-exploding all behave naturally.
 */
export function buildExplodeSlider(toolbar: HTMLElement, doc: CadDocument, status: HTMLElement) {
  const group = toolbar.appendChild(Object.assign(document.createElement('div'), { className: 'group field' }))
  group.append(Object.assign(document.createElement('span'), { textContent: 'Explode' }))
  const slider = group.appendChild(document.createElement('input'))
  slider.type = 'range'
  slider.min = '0'
  slider.max = '200'
  slider.step = '5'
  slider.value = '0'

  let anchors: Anchor[] = []

  const capture = () => {
    if (doc.objects.length === 0) {
      anchors = []
      return
    }
    const box = new THREE.Box3()
    for (const obj of doc.objects) box.expandByObject(obj.mesh)
    const centre = box.getCenter(new THREE.Vector3())
    anchors = doc.objects.map((obj) => {
      obj.mesh.updateMatrixWorld()
      const objectCentre = new THREE.Box3().setFromObject(obj.mesh).getCenter(new THREE.Vector3())
      // Fall back to a tiny +X push so parts stacked exactly on the centre still separate.
      const offset = objectCentre.sub(centre)
      if (offset.lengthSq() < 0.001) offset.set(0.1, 0, 0)
      return { obj, origin: obj.mesh.position.clone(), offset }
    })
  }
  capture()

  const apply = (percent: number) => {
    if (anchors.length === 0) return
    const factor = percent / 100
    for (const anchor of anchors) {
      anchor.obj.mesh.position.copy(anchor.origin).addScaledVector(anchor.offset, factor)
    }
  }

  slider.addEventListener('input', () => {
    apply(slider.valueAsNumber)
    status.textContent = slider.valueAsNumber === 0 ? 'Explode: assembled' : `Explode: ${slider.value}%`
  })
  slider.addEventListener('change', () => {
    // Bake the current explode into the scene so undo tracks it. Reset the slider back to 0.
    if (slider.valueAsNumber === 0) return
    doc.commit()
    slider.value = '0'
    capture()
  })

  // Re-capture whenever the scene changes structurally (but not while the slider is mid-drag).
  doc.addEventListener('change', () => {
    if (slider.valueAsNumber === 0) capture()
  })
}
