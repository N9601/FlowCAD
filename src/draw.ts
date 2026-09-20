import * as THREE from 'three'
import { addShape } from './actions'
import type { CadDocument } from './document'
import type { Viewport } from './viewport'

type Tool = 'rectangle' | 'circle' | null

const CLICK_SLOP_PX = 4
const GROUND = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
const DEFAULT_HEIGHT = 10

/**
 * Adds two draw tools that click-drag on the ground (Z = 0) to sketch a rectangle or circle
 * footprint; on release the shape becomes a 10 mm tall Cube or Cylinder ready to edit.
 */
export function buildDrawTools(toolbar: HTMLElement, view: Viewport, doc: CadDocument, status: HTMLElement) {
  const dom = view.renderer.domElement
  const raycaster = new THREE.Raycaster()
  const start = new THREE.Vector3()
  const current = new THREE.Vector3()
  const overlay = dom.parentElement!.appendChild(Object.assign(document.createElement('div'), { className: 'sketch-overlay' }))
  overlay.hidden = true
  let tool: Tool = null
  let drawing = false

  const project = (client: { x: number; y: number }): THREE.Vector3 | undefined => {
    const rect = dom.getBoundingClientRect()
    const ndc = new THREE.Vector2(((client.x - rect.left) / rect.width) * 2 - 1, -((client.y - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, view.camera)
    const hit = new THREE.Vector3()
    return raycaster.ray.intersectPlane(GROUND, hit) ? hit : undefined
  }

  const setTool = (next: Tool) => {
    tool = next
    doc.pickingEnabled = tool === null
    dom.style.cursor = tool ? 'crosshair' : ''
    overlay.hidden = true
    for (const btn of toolbar.querySelectorAll('.draw-button')) btn.classList.toggle('active', (btn as HTMLElement).dataset.tool === tool)
    if (tool) status.textContent = `Sketch: click-drag on the ground to draw a ${tool}. Escape to cancel.`
  }

  const showPreview = () => {
    const rect = dom.getBoundingClientRect()
    const a = start.clone().project(view.camera)
    const b = current.clone().project(view.camera)
    const ax = ((a.x + 1) / 2) * rect.width
    const ay = ((1 - a.y) / 2) * rect.height
    const bx = ((b.x + 1) / 2) * rect.width
    const by = ((1 - b.y) / 2) * rect.height
    if (tool === 'rectangle') {
      overlay.className = 'sketch-overlay rectangle'
      overlay.style.left = `${Math.min(ax, bx)}px`
      overlay.style.top = `${Math.min(ay, by)}px`
      overlay.style.width = `${Math.abs(bx - ax)}px`
      overlay.style.height = `${Math.abs(by - ay)}px`
      const dx = Math.abs(current.x - start.x)
      const dy = Math.abs(current.y - start.y)
      overlay.textContent = `${dx.toFixed(1)} x ${dy.toFixed(1)} mm`
    } else {
      const radius = Math.hypot(current.x - start.x, current.y - start.y)
      const pixelRadius = Math.hypot(bx - ax, by - ay)
      overlay.className = 'sketch-overlay circle'
      overlay.style.left = `${ax - pixelRadius}px`
      overlay.style.top = `${ay - pixelRadius}px`
      overlay.style.width = `${pixelRadius * 2}px`
      overlay.style.height = `${pixelRadius * 2}px`
      overlay.textContent = `r ${radius.toFixed(1)} mm`
    }
    overlay.hidden = false
  }

  const down = new THREE.Vector2()
  dom.addEventListener('pointerdown', (e) => {
    if (!tool || e.button !== 0) return
    const point = project(e)
    if (!point) return
    down.set(e.clientX, e.clientY)
    drawing = true
    start.copy(point)
    current.copy(point)
    view.controls.enabled = false
  })
  dom.addEventListener('pointermove', (e) => {
    if (!drawing) return
    const point = project(e)
    if (!point) return
    current.copy(point)
    if (down.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > CLICK_SLOP_PX) showPreview()
  })
  dom.addEventListener('pointerup', async (e) => {
    if (!drawing || !tool) return
    drawing = false
    view.controls.enabled = true
    overlay.hidden = true
    if (down.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) <= CLICK_SLOP_PX) return
    try {
      if (tool === 'rectangle') {
        const dx = Math.abs(current.x - start.x)
        const dy = Math.abs(current.y - start.y)
        if (dx < 0.5 || dy < 0.5) throw new Error('Rectangle must be at least 0.5 mm on each side')
        const obj = await addShape(doc, 'Cube', { kind: 'cube', x: dx, y: dy, z: DEFAULT_HEIGHT })
        obj.mesh.position.set((start.x + current.x) / 2, (start.y + current.y) / 2, DEFAULT_HEIGHT / 2)
      } else {
        const radius = Math.hypot(current.x - start.x, current.y - start.y)
        if (radius < 0.5) throw new Error('Circle must be at least 0.5 mm radius')
        const obj = await addShape(doc, 'Cylinder', { kind: 'cylinder', radius, height: DEFAULT_HEIGHT, segments: 64 })
        obj.mesh.position.set(start.x, start.y, DEFAULT_HEIGHT / 2)
      }
      doc.commit()
    } catch (err) {
      status.textContent = `Error: ${err instanceof Error ? err.message : err}`
    }
  })

  const group = toolbar.appendChild(Object.assign(document.createElement('div'), { className: 'group' }))
  const rectBtn = group.appendChild(Object.assign(document.createElement('button'), { textContent: 'Draw ▭', className: 'draw-button' }))
  rectBtn.dataset.tool = 'rectangle'
  rectBtn.title = 'Click and drag on the ground plane to place a Cube at that footprint.'
  const circBtn = group.appendChild(Object.assign(document.createElement('button'), { textContent: 'Draw ⬤', className: 'draw-button' }))
  circBtn.dataset.tool = 'circle'
  circBtn.title = 'Click a centre and drag to a radius to place a Cylinder.'
  rectBtn.addEventListener('click', () => setTool(tool === 'rectangle' ? null : 'rectangle'))
  circBtn.addEventListener('click', () => setTool(tool === 'circle' ? null : 'circle'))

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tool) setTool(null)
  })
}
