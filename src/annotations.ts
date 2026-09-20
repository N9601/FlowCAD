import * as THREE from 'three'
import type { CadDocument } from './document'
import type { Viewport } from './viewport'

interface Annotation {
  id: number
  anchor: THREE.Vector3
  text: string
  element: HTMLDivElement
}

/**
 * World-anchored callouts. Click **Note** in the toolbar, then click a point on any object;
 * the label projects each frame so it stays glued to that point as the camera moves. Click the
 * label's X to delete it. Annotations survive scene edits but not reloads (kept intentionally
 * lightweight — the project file remains geometry-only).
 */
export function buildAnnotations(scene: HTMLElement, toolbar: HTMLElement, view: Viewport, doc: CadDocument, status: HTMLElement) {
  const layer = scene.appendChild(Object.assign(document.createElement('div'), { className: 'annotations' }))
  const items: Annotation[] = []
  let placing = false
  let nextId = 1

  const toggle = toolbar.appendChild(Object.assign(document.createElement('div'), { className: 'group' })).appendChild(
    Object.assign(document.createElement('button'), { textContent: 'Note' }),
  )
  toggle.title = 'Click a point on any model to attach a callout label.'
  toggle.addEventListener('click', () => setPlacing(!placing))

  const setPlacing = (next: boolean) => {
    placing = next
    doc.pickingEnabled = !placing
    toggle.classList.toggle('active', placing)
    view.renderer.domElement.style.cursor = placing ? 'crosshair' : ''
    status.textContent = placing ? 'Annotation: click a point on any model.' : ''
  }

  const remove = (id: number) => {
    const i = items.findIndex((a) => a.id === id)
    if (i === -1) return
    items[i].element.remove()
    items.splice(i, 1)
  }

  const project = new THREE.Vector3()
  const redraw = () => {
    const rect = view.renderer.domElement.getBoundingClientRect()
    for (const item of items) {
      project.copy(item.anchor).project(view.camera)
      const behind = project.z > 1
      const x = ((project.x + 1) / 2) * rect.width
      const y = ((1 - project.y) / 2) * rect.height
      item.element.style.left = `${x}px`
      item.element.style.top = `${y}px`
      item.element.style.display = behind ? 'none' : ''
    }
  }
  view.controls.addEventListener('change', redraw)
  doc.addEventListener('change', redraw)
  doc.addEventListener('transform', redraw)
  window.addEventListener('resize', redraw)
  new ResizeObserver(redraw).observe(scene)

  const raycaster = new THREE.Raycaster()
  const downAt = new THREE.Vector2()
  view.renderer.domElement.addEventListener('pointerdown', (e) => downAt.set(e.clientX, e.clientY))
  view.renderer.domElement.addEventListener('pointerup', (e) => {
    if (!placing || e.button !== 0) return
    if (downAt.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 4) return
    const rect = view.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, view.camera)
    const hit = raycaster.intersectObjects(doc.objects.map((o) => o.mesh), false)[0]
    if (!hit) {
      status.textContent = 'Click landed on empty space; try clicking on a model.'
      return
    }
    const text = prompt('Annotation:')?.trim()
    if (!text) return
    const id = nextId++
    const element = document.createElement('div')
    element.className = 'annotation'
    element.innerHTML = `<span class="text"></span><button class="close" title="Delete">×</button>`
    element.querySelector<HTMLSpanElement>('.text')!.textContent = text
    element.querySelector<HTMLButtonElement>('.close')!.addEventListener('click', () => remove(id))
    layer.appendChild(element)
    items.push({ id, anchor: hit.point.clone(), text, element })
    setPlacing(false)
    redraw()
    status.textContent = `Added annotation "${text}"`
  })
}
