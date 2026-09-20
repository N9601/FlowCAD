import { chamfer, combine, fillet } from './actions'
import { csg } from './csg/client'
import type { BooleanOp, SolidData } from './csg/protocol'
import type { CadDocument } from './document'
import type { ViewName, Viewport } from './viewport'
import { decodeGlb, encodeGlb } from './io/gltf'
import { decodeObj, encode3mf, encodeObj, type NamedPart } from './io/mesh-formats'
import { decodePly, encodePly } from './io/ply'
import { decodeProject, encodeProject } from './io/project'
import { encodeDxf, encodeSvg } from './io/section'
import { decodeStl, download, encodeBinaryStl } from './io/stl'

const BOOLEANS: { label: string; op: BooleanOp }[] = [
  { label: 'Union', op: 'union' },
  { label: 'Subtract', op: 'subtract' },
  { label: 'Intersect', op: 'intersect' },
]

export function buildToolbar(root: HTMLElement, status: HTMLElement, doc: CadDocument, view: Viewport) {
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

  const booleans = group()
  for (const { label, op } of BOOLEANS) {
    needsTwo.push(
      button(booleans, label, async () => {
        const inputs = [...doc.selection]
        const started = performance.now()
        status.textContent = `${label}...`
        await combine(doc, op, inputs)
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

  const views = group()
  button(views, 'Fit (F)', () => view.frame(doc.frameTargets))
  const VIEW_KEYS: Record<string, ViewName> = { '1': 'front', '2': 'right', '3': 'top', '4': 'iso' }
  for (const [key, name] of Object.entries(VIEW_KEYS)) {
    button(views, `${name[0].toUpperCase()}${name.slice(1)} (${key})`, () => view.frame(doc.frameTargets, name))
  }

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return
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
    else if (key === 'f') view.frame(doc.frameTargets)
    else if (key in VIEW_KEYS) view.frame(doc.frameTargets, VIEW_KEYS[key])
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
      const ext = f.name.split('.').pop()!.toLowerCase()
      status.textContent = `Importing ${f.name}...`
      if (ext === 'flowcad') {
        doc.load(decodeProject(await f.arrayBuffer()))
        continue
      }
      const decoders: Record<string, (data: ArrayBuffer) => SolidData> = { stl: decodeStl, obj: decodeObj, glb: decodeGlb, ply: decodePly }
      const decode = decoders[ext]
      if (!decode) throw new Error(`${f.name}: only .flowcad, STL, OBJ, GLB and PLY files can be imported`)
      const solid = await csg.validate(decode(await f.arrayBuffer()))
      doc.add(f.name.replace(/\.[^.]+$/, ''), solid)
      doc.commit()
    }
  }
  const picker = Object.assign(document.createElement('input'), { type: 'file', accept: '.flowcad,.stl,.obj,.glb,.ply', multiple: true })
  picker.addEventListener('change', async () => {
    try {
      await importFiles(picker.files ?? [])
    } catch (err) {
      status.textContent = `Error: ${err instanceof Error ? err.message : err}`
    }
    picker.value = ''
  })
  button(file, 'Open', () => picker.click())

  window.addEventListener('dragover', (e) => e.preventDefault())
  window.addEventListener('drop', async (e) => {
    e.preventDefault()
    try {
      await importFiles(e.dataTransfer?.files ?? [])
    } catch (err) {
      status.textContent = `Error: ${err instanceof Error ? err.message : err}`
    }
  })
  needsAny.push(
    button(file, 'Save project', () => {
      download(encodeProject(doc.serialize()), 'project.flowcad')
      status.textContent = `Saved ${doc.objects.length} object(s) to project.flowcad`
    }),
  )
  const exporters: Record<string, (parts: NamedPart[]) => ArrayBuffer> = {
    stl: encodeBinaryStl,
    obj: encodeObj,
    '3mf': encode3mf,
    glb: encodeGlb,
    ply: encodePly,
  }
  const format = file.appendChild(document.createElement('select'))
  for (const ext of Object.keys(exporters)) format.add(new Option(ext.toUpperCase(), ext))
  needsAny.push(
    button(file, 'Export', () => {
      const ext = format.value
      const targets = doc.selection.length > 0 ? doc.selection : doc.objects
      download(exporters[ext](targets.map((o) => ({ name: o.name, ...doc.placed(o) }))), `flowcad.${ext}`)
      status.textContent = `Exported ${targets.length} object(s) to flowcad.${ext}`
    }),
  )

  const modify = group()
  const filletField = modify.appendChild(Object.assign(document.createElement('label'), { className: 'field', textContent: 'Fillet r' }))
  const filletRadius = filletField.appendChild(Object.assign(document.createElement('input'), { type: 'number', value: '2', step: '0.5', min: '0.1' }))
  const runRounding = (op: 'fillet' | 'chamfer', label: string) => async () => {
    const radius = filletRadius.valueAsNumber
    if (!Number.isFinite(radius) || radius <= 0) throw new Error(`${label} radius must be greater than zero`)
    const started = performance.now()
    const original = doc.selection[0].name
    status.textContent = `${label} on ${original}...`
    await (op === 'fillet' ? fillet : chamfer)(doc, doc.selection[0], radius)
    doc.commit()
    status.textContent = `${label} on ${original} by ${radius} mm in ${(performance.now() - started).toFixed(0)} ms`
  }
  needsOne.push(button(modify, 'Fillet', runRounding('fillet', 'Fillet')))
  needsOne.push(button(modify, 'Chamfer', runRounding('chamfer', 'Chamfer')))

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
