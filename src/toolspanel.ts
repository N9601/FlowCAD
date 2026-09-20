import { Vector3 } from 'three'
import { align, circularArray, dropOntoSurface, dropToBed, linearArray, mirror, type Axis } from './arrange'
import { settleWithPhysics } from './physics'
import type { CadDocument } from './document'

const AXES: Axis[] = ['x', 'y', 'z']

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function buildToolsPanel(section: HTMLElement, status: HTMLElement, doc: CadDocument) {
  // Array settings survive re-renders so they are not reset by every selection change.
  const linear = { count: 3, x: 30, y: 0, z: 0 }
  const circular = { count: 6, sweep: 360 }

  const render = () => {
    section.replaceChildren()
    const selection = [...doc.selection]
    if (selection.length === 0) return
    section.appendChild(el('h2', undefined, 'Tools'))

    /** Runs an edit, records it as one undo step, and reports failures in the status bar. */
    const action = (parent: HTMLElement, label: string, run: () => void) => {
      const button = parent.appendChild(el('button', undefined, label))
      button.addEventListener('click', () => {
        try {
          run()
          doc.commit()
        } catch (err) {
          status.textContent = `Error: ${err instanceof Error ? err.message : err}`
        }
      })
    }
    const buttonRow = () => section.appendChild(el('div', 'buttons'))
    const numberField = (parent: HTMLElement, label: string, store: Record<string, number>, key: string) => {
      const field = parent.appendChild(el('label', 'mini'))
      field.appendChild(el('span', undefined, label))
      const input = field.appendChild(el('input'))
      input.type = 'number'
      input.value = String(store[key])
      input.addEventListener('change', () => {
        if (Number.isFinite(input.valueAsNumber)) store[key] = input.valueAsNumber
      })
    }

    const groupIds = new Set(selection.map((o) => o.groupId).filter((id): id is number => id !== undefined))
    if (selection.length >= 2 || groupIds.size > 0) {
      const groupRow = buttonRow()
      if (selection.length >= 2) {
        action(groupRow, 'Group', () => {
          const id = doc.groupSelection()
          if (id !== undefined) status.textContent = `Grouped ${selection.length} objects into G${id}`
        })
      }
      if (groupIds.size > 0) {
        action(groupRow, 'Ungroup', () => {
          doc.ungroupSelection()
          status.textContent = 'Ungrouped'
        })
      }
    }

    const dropRow = buttonRow()
    action(dropRow, 'Drop to bed (B)', () => dropToBed(selection))
    action(dropRow, 'Drop onto surface', () => dropOntoSurface(selection, doc.objects))
    const physicsBtn = section.appendChild(el('button', undefined, 'Physics settle'))
    physicsBtn.title = 'Drop every visible object under gravity and let them stack; final resting positions become the new scene.'
    physicsBtn.addEventListener('click', async () => {
      status.textContent = 'Settling under gravity...'
      const started = performance.now()
      await settleWithPhysics(doc)
      status.textContent = `Physics settle complete in ${(performance.now() - started).toFixed(0)} ms`
    })

    section.appendChild(el('h3', undefined, 'Mirror'))
    const mirrorRow = buttonRow()
    for (const axis of AXES) action(mirrorRow, axis.toUpperCase(), () => mirror(selection, axis))

    if (selection.length > 1) {
      const [target, ...others] = selection
      section.appendChild(el('h3', undefined, `Align to ${target.name}`))
      const centreRow = buttonRow()
      for (const axis of AXES) action(centreRow, `Centre ${axis.toUpperCase()}`, () => align(target, others, axis, 'centre'))
      action(buttonRow(), 'Same base height', () => align(target, others, 'z', 'min'))
      return
    }

    const [obj] = selection
    section.appendChild(el('h3', undefined, 'Linear array'))
    const linearRow = section.appendChild(el('div', 'fields'))
    numberField(linearRow, 'Count', linear, 'count')
    for (const axis of AXES) numberField(linearRow, `d${axis.toUpperCase()}`, linear, axis)
    action(buttonRow(), 'Create linear array', () => {
      doc.select([obj, ...linearArray(doc, obj, linear.count, new Vector3(linear.x, linear.y, linear.z))])
    })

    section.appendChild(el('h3', undefined, 'Circular array about Z'))
    const circularRow = section.appendChild(el('div', 'fields'))
    numberField(circularRow, 'Count', circular, 'count')
    numberField(circularRow, 'Sweep', circular, 'sweep')
    action(buttonRow(), 'Create circular array', () => {
      doc.select([obj, ...circularArray(doc, obj, circular.count, circular.sweep)])
    })
  }

  doc.addEventListener('change', render)
  window.addEventListener('keydown', (e) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement
    if (typing || e.ctrlKey || e.metaKey || e.key.toLowerCase() !== 'b' || doc.selection.length === 0) return
    dropToBed(doc.selection)
    doc.commit()
  })
  render()
}
