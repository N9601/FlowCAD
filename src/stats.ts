import * as THREE from 'three'
import type { CadDocument } from './document'
import { formatLength } from './units'

/** Lightweight always-on overlay: framerate, triangle count, object count, and selection dimensions. */
export function buildStats(scene: HTMLElement, doc: CadDocument) {
  const overlay = scene.appendChild(Object.assign(document.createElement('div'), { className: 'stats-overlay' }))
  const stats = overlay.appendChild(document.createElement('div'))
  const sel = overlay.appendChild(Object.assign(document.createElement('div'), { className: 'stats-sel' }))

  let frames = 0
  let fps = 0
  let lastFpsAt = performance.now()

  const totalTriangles = () => doc.objects.reduce((n, o) => (o.visible ? n + o.solid.indices.length / 3 : n), 0)

  const box = new THREE.Box3()
  const size = new THREE.Vector3()
  const renderSelection = () => {
    if (doc.selection.length === 0) {
      sel.textContent = ''
      return
    }
    box.makeEmpty()
    for (const o of doc.selection) box.expandByObject(o.mesh)
    box.getSize(size)
    sel.textContent = `${formatLength(size.x)} × ${formatLength(size.y)} × ${formatLength(size.z)}`
  }

  const render = () => {
    stats.textContent = `${fps.toFixed(0)} fps  ${totalTriangles().toLocaleString()} tris  ${doc.objects.length} obj`
    renderSelection()
  }
  render()
  doc.addEventListener('change', render)

  // requestAnimationFrame gives an accurate framerate independent of the renderer's own loop.
  const tick = () => {
    frames++
    const now = performance.now()
    if (now - lastFpsAt >= 500) {
      fps = (frames * 1000) / (now - lastFpsAt)
      frames = 0
      lastFpsAt = now
      render()
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
