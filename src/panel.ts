import * as THREE from 'three'
import { csg } from './csg/client'
import { METRIC_SIZES } from './csg/iso'
import type { PrimitiveSpec } from './csg/protocol'
import type { CadDocument, SceneObject } from './document'

interface Field {
  key: string
  label: string
  min: number
  step: number
  max?: number
  integer?: boolean
  /** Renders a dropdown instead of a free number. */
  options?: { value: number; label: string }[]
}

const mm = (key: string, label: string): Field => ({ key, label, min: 0.1, step: 1 })
const SEGMENTS: Field = { key: 'segments', label: 'Segments', min: 3, max: 256, step: 1, integer: true }

const METRIC: Field = {
  key: 'size',
  label: 'Size',
  min: 0,
  step: 1,
  options: METRIC_SIZES.map((s) => ({ value: s.d, label: `M${s.d} x ${s.pitch}` })),
}

const FIELDS: Record<PrimitiveSpec['kind'], Field[]> = {
  cube: [mm('x', 'Width X'), mm('y', 'Depth Y'), mm('z', 'Height Z')],
  cylinder: [mm('radius', 'Radius'), mm('height', 'Height'), SEGMENTS],
  sphere: [mm('radius', 'Radius'), SEGMENTS],
  cone: [mm('radius', 'Radius'), mm('height', 'Height'), SEGMENTS],
  tube: [mm('outerRadius', 'Outer radius'), mm('innerRadius', 'Inner radius'), mm('height', 'Height'), SEGMENTS],
  torus: [mm('majorRadius', 'Major radius'), mm('minorRadius', 'Tube radius'), SEGMENTS],
  bolt: [METRIC, mm('length', 'Shank length')],
  nut: [METRIC, { key: 'clearance', label: 'Thread clearance', min: 0, max: 1, step: 0.05 }],
  rod: [METRIC, mm('length', 'Length')],
  gear: [
    { key: 'module', label: 'Module', min: 0.2, step: 0.5 },
    { key: 'teeth', label: 'Teeth', min: 6, max: 200, step: 1, integer: true },
    { key: 'pressureAngle', label: 'Pressure angle', min: 14.5, max: 25, step: 0.5 },
    mm('thickness', 'Thickness'),
    { key: 'bore', label: 'Bore diameter', min: 0, step: 1 },
  ],
}

function checkSpec(spec: PrimitiveSpec) {
  if (spec.kind === 'tube' && spec.innerRadius >= spec.outerRadius) {
    throw new Error('Inner radius must be smaller than outer radius')
  }
  if (spec.kind === 'torus' && spec.minorRadius >= spec.majorRadius) {
    throw new Error('Tube radius must be smaller than major radius')
  }
  if ((spec.kind === 'bolt' || spec.kind === 'rod') && spec.length > 200) {
    throw new Error('Length is limited to 200 mm')
  }
  if (spec.kind === 'gear' && spec.bore >= spec.module * (spec.teeth - 2.5)) {
    throw new Error('Bore must be smaller than the root diameter')
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function buildPanel(root: HTMLElement, status: HTMLElement, doc: CadDocument) {
  const list = root.appendChild(el('section'))
  const props = root.appendChild(el('section'))
  let positionInputs: (HTMLInputElement | HTMLSelectElement)[] = []

  const numberRow = (parent: HTMLElement, label: string, value: number, field: Partial<Field>, onChange: (v: number) => void) => {
    const row = parent.appendChild(el('label', 'row'))
    row.appendChild(el('span', undefined, label))
    const input = row.appendChild(el(field.options ? 'select' : 'input'))
    if (input instanceof HTMLSelectElement) {
      for (const o of field.options!) input.add(new Option(o.label, String(o.value)))
    } else {
      input.type = 'number'
      if (field.min !== undefined) input.min = String(field.min)
      input.step = String(field.step ?? 1)
    }
    input.value = String(+value.toFixed(3))
    input.addEventListener('change', async () => {
      try {
        const v = Number(input.value)
        if (input.value === '' || !Number.isFinite(v)) throw new Error(`${label} must be a number`)
        await onChange(v)
      } catch (err) {
        status.textContent = `Error: ${err instanceof Error ? err.message : err}`
        input.value = String(+value.toFixed(3))
      }
    })
    return input
  }

  const renderList = () => {
    list.replaceChildren(el('h2', undefined, `Objects (${doc.objects.length})`))
    if (doc.objects.length === 0) list.appendChild(el('p', 'hint', 'Add a primitive from the toolbar.'))
    for (const obj of doc.objects) {
      const rank = doc.selection.indexOf(obj)
      const item = list.appendChild(el('div', `item${rank === 0 ? ' primary' : rank > 0 ? ' secondary' : ''}`, obj.name))
      item.addEventListener('click', (e) => {
        if (!e.shiftKey) doc.select([obj])
        else if (rank !== -1) doc.select(doc.selection.filter((o) => o !== obj))
        else doc.select([...doc.selection, obj])
      })
    }
  }

  const renderProps = () => {
    positionInputs = []
    props.replaceChildren(el('h2', undefined, 'Properties'))
    if (doc.selection.length !== 1) {
      props.appendChild(el('p', 'hint', doc.selection.length === 0 ? 'Nothing selected.' : `${doc.selection.length} objects selected.`))
      return
    }
    const obj = doc.selection[0]

    const nameRow = props.appendChild(el('label', 'row'))
    nameRow.appendChild(el('span', undefined, 'Name'))
    const name = nameRow.appendChild(el('input'))
    name.value = obj.name
    name.addEventListener('change', () => {
      obj.name = name.value.trim() || obj.name
      doc.commit()
    })

    props.appendChild(el('h3', undefined, 'Position (mm)'))
    positionInputs = (['x', 'y', 'z'] as const).map((axis) =>
      numberRow(props, axis.toUpperCase(), obj.mesh.position[axis], { step: 1 }, (v) => {
        obj.mesh.position[axis] = v
        doc.commit()
      }),
    )

    if (obj.spec) renderSpec(obj, obj.spec)

    const size = new THREE.Box3().setFromObject(obj.mesh).getSize(new THREE.Vector3())
    props.appendChild(el('h3', undefined, 'Info'))
    props.appendChild(el('p', 'hint', `Size ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} mm`))
    props.appendChild(el('p', 'hint', `${obj.solid.indices.length / 3} triangles, ${obj.solid.positions.length / 3} vertices`))
  }

  const renderSpec = (obj: SceneObject, spec: PrimitiveSpec) => {
    props.appendChild(el('h3', undefined, 'Dimensions (mm)'))
    const values = spec as unknown as Record<string, number>
    for (const field of FIELDS[spec.kind]) {
      numberRow(props, field.label, values[field.key], field, async (v) => {
        const value = Math.min(field.max ?? Infinity, Math.max(field.min, field.integer ? Math.round(v) : v))
        const next = { ...spec, [field.key]: value } as PrimitiveSpec
        checkSpec(next)
        doc.replaceSolid(obj, await csg.primitive(next), next)
      })
    }
  }

  doc.addEventListener('change', () => {
    renderList()
    renderProps()
  })
  doc.addEventListener('transform', () => {
    const obj = doc.selection.at(-1)
    if (!obj || positionInputs.length !== 3) return
    positionInputs.forEach((input, i) => (input.value = String(+obj.mesh.position.getComponent(i).toFixed(3))))
  })
  renderList()
  renderProps()
}
