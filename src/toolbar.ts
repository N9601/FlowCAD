import { csg } from './csg/client'
import type { BooleanOp, PrimitiveSpec } from './csg/protocol'
import type { CadDocument } from './document'
import { download, encodeBinaryStl } from './io/stl'

const PRIMITIVES: { label: string; spec: PrimitiveSpec }[] = [
  { label: 'Cube', spec: { kind: 'cube', size: [20, 20, 20] } },
  { label: 'Cylinder', spec: { kind: 'cylinder', radius: 10, height: 20, segments: 64 } },
  { label: 'Sphere', spec: { kind: 'sphere', radius: 12, segments: 64 } },
  { label: 'Cone', spec: { kind: 'cone', radius: 10, height: 20, segments: 64 } },
  { label: 'Tube', spec: { kind: 'tube', outerRadius: 10, innerRadius: 7, height: 20, segments: 64 } },
  { label: 'Torus', spec: { kind: 'torus', majorRadius: 14, minorRadius: 4, segments: 64 } },
]

const BOOLEANS: { label: string; op: BooleanOp }[] = [
  { label: 'Union', op: 'union' },
  { label: 'Subtract', op: 'subtract' },
  { label: 'Intersect', op: 'intersect' },
]

export function buildToolbar(root: HTMLElement, status: HTMLElement, doc: CadDocument) {
  const needsTwo: HTMLButtonElement[] = []
  const needsOne: HTMLButtonElement[] = []
  const needsAny: HTMLButtonElement[] = []

  const group = () => root.appendChild(Object.assign(document.createElement('div'), { className: 'group' }))
  const button = (parent: HTMLElement, label: string, action: () => Promise<void> | void) => {
    const el = document.createElement('button')
    el.textContent = label
    el.addEventListener('click', async () => {
      try {
        await action()
      } catch (err) {
        status.textContent = `Error: ${err instanceof Error ? err.message : err}`
      }
    })
    return parent.appendChild(el)
  }

  const primitives = group()
  for (const { label, spec } of PRIMITIVES) {
    button(primitives, label, async () => {
      doc.add(label, await csg.primitive(spec), true)
      doc.commit()
    })
  }

  const booleans = group()
  for (const { label, op } of BOOLEANS) {
    needsTwo.push(
      button(booleans, label, async () => {
        const [a, b] = doc.selection
        const started = performance.now()
        status.textContent = `${label}...`
        const solid = await csg.boolean(op, doc.placed(a), doc.placed(b))
        doc.remove([a, b])
        doc.add(label, solid)
        doc.commit()
        status.textContent = `${label} done in ${(performance.now() - started).toFixed(0)} ms`
      }),
    )
  }

  const edit = group()
  const deleteSelection = () => {
    if (doc.selection.length === 0) return
    doc.remove([...doc.selection])
    doc.commit()
  }
  const undo = button(edit, 'Undo', () => doc.undo())
  const redo = button(edit, 'Redo', () => doc.redo())
  needsOne.push(button(edit, 'Delete', deleteSelection))

  const gizmo = group()
  button(gizmo, 'Move (W)', () => doc.setGizmoMode('translate'))
  button(gizmo, 'Rotate (E)', () => doc.setGizmoMode('rotate'))
  button(gizmo, 'Scale (R)', () => doc.setGizmoMode('scale'))

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase()
    if (e.ctrlKey || e.metaKey) {
      if (key === 'z' && !e.shiftKey) doc.undo()
      else if (key === 'y' || (key === 'z' && e.shiftKey)) doc.redo()
      else return
      e.preventDefault()
    } else if (key === 'delete' || key === 'backspace') deleteSelection()
    else if (key === 'escape') doc.select([])
    else if (key === 'w') doc.setGizmoMode('translate')
    else if (key === 'e') doc.setGizmoMode('rotate')
    else if (key === 'r') doc.setGizmoMode('scale')
  })

  const file = group()
  needsAny.push(
    button(file, 'Export STL', () => {
      const targets = doc.selection.length > 0 ? doc.selection : doc.objects
      download(encodeBinaryStl(targets.map((o) => doc.placed(o))), 'flowcad.stl')
      status.textContent = `Exported ${targets.length} object(s) to flowcad.stl`
    }),
  )

  const refresh = () => {
    const n = doc.selection.length
    for (const b of needsTwo) b.disabled = n !== 2
    for (const b of needsOne) b.disabled = n === 0
    for (const b of needsAny) b.disabled = doc.objects.length === 0
    undo.disabled = !doc.canUndo
    redo.disabled = !doc.canRedo
    status.textContent =
      n === 0
        ? 'Click an object to select. Shift-click a second one to combine them.'
        : n === 1
          ? `${doc.selection[0].name} selected`
          : n === 2
            ? `${doc.selection[0].name} (target) + ${doc.selection[1].name} (tool)`
            : `${n} objects selected`
  }
  doc.addEventListener('change', refresh)
  refresh()
}
