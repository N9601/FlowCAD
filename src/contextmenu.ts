import { chamfer, combine, fillet } from './actions'
import type { CadDocument, SceneObject } from './document'
import { encodeBom } from './io/bom'
import { download } from './io/stl'

interface Entry {
  label: string
  keys?: string
  disabled?: boolean
  action: () => void | Promise<void>
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

export function buildContextMenu(viewport: HTMLElement, doc: CadDocument, status: HTMLElement) {
  const menu = document.body.appendChild(el('div', 'context-menu'))
  menu.hidden = true

  const hide = () => (menu.hidden = true)
  document.addEventListener('click', hide)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide()
  })

  const canvas = viewport.querySelector('canvas')
  const target = canvas ?? viewport

  const isolate = (obj: SceneObject) => {
    for (const other of doc.objects) if (other !== obj && other.visible) doc.toggleVisible(other)
  }
  const showAll = () => {
    for (const obj of doc.objects) if (!obj.visible) doc.toggleVisible(obj)
  }

  const build = (obj: SceneObject | undefined) => {
    const selection = obj ? doc.expandGroups([obj]) : [...doc.selection]
    const entries: Entry[] = []
    if (selection.length > 0) {
      entries.push({ label: 'Duplicate', keys: 'Ctrl+D', action: () => doc.duplicate() })
      entries.push({
        label: 'Fillet 2 mm',
        disabled: selection.length !== 1,
        action: async () => {
          const first = selection[0]
          await fillet(doc, first, 2)
          doc.commit()
          status.textContent = `Filleted ${first.name} by 2 mm`
        },
      })
      entries.push({
        label: 'Chamfer 2 mm',
        disabled: selection.length !== 1,
        action: async () => {
          const first = selection[0]
          await chamfer(doc, first, 2)
          doc.commit()
          status.textContent = `Chamfered ${first.name} by 2 mm`
        },
      })
      if (selection.length >= 2) {
        entries.push({
          label: 'Union',
          action: async () => {
            await combine(doc, 'union', selection)
            doc.commit()
          },
        })
        entries.push({
          label: 'Subtract',
          action: async () => {
            await combine(doc, 'subtract', selection)
            doc.commit()
          },
        })
        entries.push({
          label: 'Group',
          action: () => {
            doc.groupSelection()
          },
        })
      }
      if (selection.some((o) => o.groupId !== undefined)) {
        entries.push({
          label: 'Ungroup',
          action: () => {
            doc.ungroupSelection()
          },
        })
      }
      entries.push({
        label: 'Isolate (hide others)',
        disabled: selection.length !== 1,
        action: () => isolate(selection[0]),
      })
      entries.push({
        label: selection.length === 1 && !selection[0].visible ? 'Show' : 'Hide',
        action: () => selection.forEach((o) => doc.toggleVisible(o)),
      })
      entries.push({
        label: 'Delete',
        keys: 'Del',
        action: () => {
          doc.remove(selection)
          doc.commit()
        },
      })
    }
    entries.push({ label: 'Show all objects', action: showAll })
    if (doc.objects.length > 0) {
      entries.push({
        label: 'Export BOM (CSV)',
        action: () => {
          download(encodeBom(doc.objects), 'flowcad-bom.csv')
          status.textContent = `Exported bill of materials for ${doc.objects.length} object(s)`
        },
      })
    }
    return entries
  }

  const openAt = (x: number, y: number, obj: SceneObject | undefined) => {
    const entries = build(obj)
    if (entries.length === 0) return
    menu.replaceChildren()
    for (const entry of entries) {
      const item = menu.appendChild(el('div', 'entry' + (entry.disabled ? ' disabled' : '')))
      item.textContent = entry.label
      if (entry.keys) {
        const keys = item.appendChild(el('span', 'keys'))
        keys.textContent = entry.keys
      }
      if (!entry.disabled) {
        item.addEventListener('click', async (e) => {
          e.stopPropagation()
          hide()
          try {
            await entry.action()
          } catch (err) {
            status.textContent = `Error: ${err instanceof Error ? err.message : err}`
          }
        })
      }
    }
    menu.hidden = false
    // Clamp to viewport so the menu stays on screen.
    menu.style.left = `${Math.min(x, window.innerWidth - menu.offsetWidth - 4)}px`
    menu.style.top = `${Math.min(y, window.innerHeight - menu.offsetHeight - 4)}px`
  }

  target.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    // If the user right-clicked on a specific object, pass it to build(); otherwise the current selection.
    openAt((e as MouseEvent).clientX, (e as MouseEvent).clientY, undefined)
  })
}
