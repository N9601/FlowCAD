import { csg } from './csg/client'
import type { BooleanOp, PrimitiveSpec } from './csg/protocol'
import type { CadDocument } from './document'
import { decodeObj, encode3mf, encodeObj, type NamedPart } from './io/mesh-formats'
import { encodeDxf, encodeSvg } from './io/section'
import { decodeStl, download, encodeBinaryStl } from './io/stl'

const PRIMITIVES: { label: string; spec: PrimitiveSpec }[] = [
  { label: 'Cube', spec: { kind: 'cube', x: 20, y: 20, z: 20 } },
  { label: 'Cylinder', spec: { kind: 'cylinder', radius: 10, height: 20, segments: 64 } },
  { label: 'Sphere', spec: { kind: 'sphere', radius: 12, segments: 64 } },
  { label: 'Cone', spec: { kind: 'cone', radius: 10, height: 20, segments: 64 } },
  { label: 'Tube', spec: { kind: 'tube', outerRadius: 10, innerRadius: 7, height: 20, segments: 64 } },
  { label: 'Torus', spec: { kind: 'torus', majorRadius: 14, minorRadius: 4, segments: 64 } },
  { label: 'Bolt', spec: { kind: 'bolt', size: 8, length: 25 } },
  { label: 'Nut', spec: { kind: 'nut', size: 8, clearance: 0.15 } },
  { label: 'Rod', spec: { kind: 'rod', size: 8, length: 40 } },
  { label: 'Gear', spec: { kind: 'gear', module: 2, teeth: 20, pressureAngle: 20, thickness: 8, bore: 8 } },
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
      doc.add(label, await csg.primitive(spec), spec)
      doc.commit()
    })
  }

  const booleans = group()
  for (const { label, op } of BOOLEANS) {
    needsTwo.push(
      button(booleans, label, async () => {
        const inputs = [...doc.selection]
        const started = performance.now()
        status.textContent = `${label}...`
        const solid = await csg.boolean(op, inputs.map((o) => doc.placed(o)))
        doc.remove(inputs)
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
  needsOne.push(button(edit, 'Duplicate', () => doc.duplicate()))
  needsOne.push(button(edit, 'Delete', deleteSelection))

  const gizmo = group()
  button(gizmo, 'Move (W)', () => doc.setGizmoMode('translate'))
  button(gizmo, 'Rotate (E)', () => doc.setGizmoMode('rotate'))
  button(gizmo, 'Scale (R)', () => doc.setGizmoMode('scale'))
  button(gizmo, 'X-Ray (X)', () => doc.toggleXray())

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
    const key = e.key.toLowerCase()
    if (e.ctrlKey || e.metaKey) {
      if (key === 'z' && !e.shiftKey) doc.undo()
      else if (key === 'y' || (key === 'z' && e.shiftKey)) doc.redo()
      else if (key === 'd') doc.duplicate()
      else return
      e.preventDefault()
    } else if (key === 'delete' || key === 'backspace') deleteSelection()
    else if (key === 'escape') doc.select([])
    else if (key === 'w') doc.setGizmoMode('translate')
    else if (key === 'e') doc.setGizmoMode('rotate')
    else if (key === 'r') doc.setGizmoMode('scale')
    else if (key === 'x') doc.toggleXray()
  })

  const file = group()
  needsAny.push(
    button(file, 'New', () => {
      doc.remove([...doc.objects])
      doc.commit()
    }),
  )
  const importFiles = async (files: Iterable<File>) => {
    for (const f of files) {
      const decode = { stl: decodeStl, obj: decodeObj }[f.name.split('.').pop()!.toLowerCase()]
      if (!decode) throw new Error(`${f.name}: only STL and OBJ files can be imported`)
      status.textContent = `Importing ${f.name}...`
      const solid = await csg.validate(decode(await f.arrayBuffer()))
      doc.add(f.name.replace(/\.[^.]+$/, ''), solid)
      doc.commit()
    }
  }
  const picker = Object.assign(document.createElement('input'), { type: 'file', accept: '.stl,.obj', multiple: true })
  picker.addEventListener('change', async () => {
    try {
      await importFiles(picker.files ?? [])
    } catch (err) {
      status.textContent = `Error: ${err instanceof Error ? err.message : err}`
    }
    picker.value = ''
  })
  button(file, 'Import', () => picker.click())

  window.addEventListener('dragover', (e) => e.preventDefault())
  window.addEventListener('drop', async (e) => {
    e.preventDefault()
    try {
      await importFiles(e.dataTransfer?.files ?? [])
    } catch (err) {
      status.textContent = `Error: ${err instanceof Error ? err.message : err}`
    }
  })
  const exporters: { ext: string; encode: (parts: NamedPart[]) => ArrayBuffer }[] = [
    { ext: 'stl', encode: encodeBinaryStl },
    { ext: 'obj', encode: encodeObj },
    { ext: '3mf', encode: encode3mf },
  ]
  for (const { ext, encode } of exporters) {
    needsAny.push(
      button(file, `Export ${ext.toUpperCase()}`, () => {
        const targets = doc.selection.length > 0 ? doc.selection : doc.objects
        download(encode(targets.map((o) => ({ name: o.name, ...doc.placed(o) }))), `flowcad.${ext}`)
        status.textContent = `Exported ${targets.length} object(s) to flowcad.${ext}`
      }),
    )
  }

  const cut = group()
  const cutLabel = cut.appendChild(Object.assign(document.createElement('label'), { className: 'field', textContent: 'Section Z' }))
  const cutZ = cutLabel.appendChild(Object.assign(document.createElement('input'), { type: 'number', value: '5', step: '1' }))
  for (const { ext, encode } of [{ ext: 'svg', encode: encodeSvg }, { ext: 'dxf', encode: encodeDxf }]) {
    needsAny.push(
      button(cut, `Export ${ext.toUpperCase()}`, async () => {
        const z = cutZ.valueAsNumber
        if (!Number.isFinite(z)) throw new Error('Section Z must be a number')
        const targets = doc.selection.length > 0 ? doc.selection : doc.objects
        const outlines = await csg.section(targets.map((o) => doc.placed(o)), z)
        download(encode(outlines), `flowcad-section.${ext}`)
        status.textContent = `Exported ${outlines.length} outline(s) at Z = ${z} mm to flowcad-section.${ext}`
      }),
    )
  }

  const refresh = () => {
    const n = doc.selection.length
    for (const b of needsTwo) b.disabled = n < 2
    for (const b of needsOne) b.disabled = n === 0
    for (const b of needsAny) b.disabled = doc.objects.length === 0
    undo.disabled = !doc.canUndo
    redo.disabled = !doc.canRedo
    status.textContent =
      n === 0
        ? 'Click to select, shift-click to add, or shift-drag a box. Two or more objects can be combined.'
        : n === 1
          ? `${doc.selection[0].name} selected`
          : `${doc.selection[0].name} (target) + ${n - 1} tool object${n > 2 ? 's' : ''}`
  }
  doc.addEventListener('change', refresh)
  refresh()
}
