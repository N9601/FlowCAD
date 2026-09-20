import { addShape } from './actions'
import { CATEGORIES } from './catalog'
import type { CadDocument } from './document'

export function buildPalette(root: HTMLElement, status: HTMLElement, doc: CadDocument) {
  for (const { title, shapes } of CATEGORIES) {
    root.appendChild(Object.assign(document.createElement('h2'), { textContent: title }))
    const grid = root.appendChild(Object.assign(document.createElement('div'), { className: 'grid' }))
    for (const { label, spec } of shapes) {
      const button = grid.appendChild(Object.assign(document.createElement('button'), { textContent: label }))
      button.addEventListener('click', async () => {
        try {
          await addShape(doc, label, spec)
          doc.commit()
        } catch (err) {
          status.textContent = `Error: ${err instanceof Error ? err.message : err}`
        }
      })
    }
  }
}
