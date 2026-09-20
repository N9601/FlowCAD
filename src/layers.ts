import * as THREE from 'three'
import { csg } from './csg/client'
import type { CadDocument, SceneObject } from './document'

const LAYER_COLOR = 0x4da3ff

/**
 * Draws horizontal contour lines at every slicer layer height across the selected object, giving a
 * quick visual of the layers a printer would extrude. Clicking again with no selection clears the
 * preview. Auto-scales the layer height for very tall objects so we never generate thousands of slices.
 */
export function buildLayerPreview(toolbar: HTMLElement, doc: CadDocument, status: HTMLElement) {
  const group = toolbar.appendChild(Object.assign(document.createElement('div'), { className: 'group field' }))
  group.append(Object.assign(document.createElement('span'), { textContent: 'Layer' }))
  const layerInput = group.appendChild(document.createElement('input'))
  layerInput.type = 'number'
  layerInput.value = '2'
  layerInput.step = '0.1'
  layerInput.min = '0.05'
  const button = group.appendChild(Object.assign(document.createElement('button'), { textContent: 'Layers' }))
  button.title = 'Slice the selected object at each layer height and overlay the outlines.'

  const overlays: THREE.LineLoop[] = []
  const clear = () => {
    for (const line of overlays.splice(0)) {
      line.removeFromParent()
      line.geometry.dispose()
    }
  }
  doc.addEventListener('change', clear) // any scene change invalidates the overlay

  button.addEventListener('click', async () => {
    if (overlays.length > 0) {
      clear()
      status.textContent = 'Layer preview cleared'
      return
    }
    if (doc.selection.length !== 1) {
      status.textContent = 'Select one object first, then click Layers.'
      return
    }
    const target: SceneObject = doc.selection[0]
    target.mesh.updateMatrixWorld()
    const box = new THREE.Box3().setFromObject(target.mesh)
    const height = box.max.z - box.min.z
    const requested = Math.max(0.05, layerInput.valueAsNumber || 2)
    // Cap at 400 slices so a 200 mm tower at 0.1 mm still stays under 5 s.
    const step = Math.max(requested, height / 400)
    const material = new THREE.LineBasicMaterial({ color: LAYER_COLOR, transparent: true, opacity: 0.65, depthTest: false })

    const started = performance.now()
    let count = 0
    for (let z = box.min.z + step / 2; z < box.max.z; z += step) {
      const loops = await csg
        .section([{ solid: target.solid, matrix: target.mesh.matrixWorld.toArray() }], z)
        .catch(() => [])
      for (const loop of loops) {
        const points = loop.map(([x, y]) => new THREE.Vector3(x, y, z))
        if (points.length < 2) continue
        const geometry = new THREE.BufferGeometry().setFromPoints(points)
        const line = new THREE.LineLoop(geometry, material)
        line.renderOrder = 8
        target.mesh.parent!.add(line)
        overlays.push(line)
        count++
      }
    }
    status.textContent = `Layer preview: ${count} contour loop(s) at ${step.toFixed(2)} mm in ${(performance.now() - started).toFixed(0)} ms`
  })
}
