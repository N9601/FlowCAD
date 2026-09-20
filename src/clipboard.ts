import * as THREE from 'three'
import type { CadDocument, NewPart } from './document'
import { decodeProject, encodeProject } from './io/project'

const PASTE_OFFSET = 10

/**
 * Ctrl+C copies the current selection to the system clipboard as a .flowcad JSON snippet.
 * Ctrl+V reads a .flowcad snippet back and inserts the parts, offset from the originals so they
 * don't overlap. Works across FlowCAD tabs and across browser sessions.
 */
export function buildClipboard(doc: CadDocument, status: HTMLElement) {
  const copy = async () => {
    if (doc.selection.length === 0) {
      status.textContent = 'Nothing selected to copy.'
      return
    }
    const selectedIds = new Set(doc.selection.map((o) => o.id))
    const snapshot = doc.serialize().filter((state) => selectedIds.has(state.id))
    if (snapshot.length === 0) return
    const text = new TextDecoder().decode(encodeProject(snapshot))
    try {
      await navigator.clipboard.writeText(text)
      status.textContent = `Copied ${snapshot.length} object(s) to clipboard`
    } catch {
      status.textContent = 'Clipboard access was denied by the browser.'
    }
  }

  const paste = async () => {
    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch {
      status.textContent = 'Clipboard read was denied by the browser.'
      return
    }
    if (!text || !text.trim().startsWith('{')) return
    let saved
    try {
      saved = decodeProject(new TextEncoder().encode(text).buffer as ArrayBuffer)
    } catch (err) {
      status.textContent = `Paste failed: ${err instanceof Error ? err.message : err}`
      return
    }
    const shift = new THREE.Matrix4().makeTranslation(PASTE_OFFSET, PASTE_OFFSET, 0)
    const inserted = saved.map((state) => {
      const part: NewPart = {
        name: `${state.name} copy`,
        color: state.color,
        visible: state.visible,
        // Deliberately drop the source group id so the paste doesn't accidentally join an existing group.
        material: state.material,
        solid: state.solid,
        spec: state.spec,
        tree: state.tree,
        matrix: new THREE.Matrix4().fromArray(state.matrix).premultiply(shift),
      }
      return doc.addPart(part)
    })
    doc.select(inserted)
    doc.commit()
    status.textContent = `Pasted ${inserted.length} object(s)`
  }

  window.addEventListener('keydown', (e) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement
    if (typing || !(e.ctrlKey || e.metaKey)) return
    const key = e.key.toLowerCase()
    if (key === 'c') {
      e.preventDefault()
      void copy()
    } else if (key === 'v') {
      e.preventDefault()
      void paste()
    }
  })
}
