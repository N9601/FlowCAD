import type { CadDocument } from './document'

/** Lightweight always-on overlay: framerate, triangle count and object count. */
export function buildStats(scene: HTMLElement, doc: CadDocument) {
  const overlay = scene.appendChild(Object.assign(document.createElement('div'), { className: 'stats-overlay' }))

  let frames = 0
  let fps = 0
  let lastFpsAt = performance.now()

  const totalTriangles = () => doc.objects.reduce((n, o) => (o.visible ? n + o.solid.indices.length / 3 : n), 0)

  const render = () => {
    overlay.textContent = `${fps.toFixed(0)} fps  ${totalTriangles().toLocaleString()} tris  ${doc.objects.length} obj`
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
