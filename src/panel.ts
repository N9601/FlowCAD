import * as THREE from 'three'
import { checkSpec } from './catalog'
import { csg } from './csg/client'
import { METRIC_SIZES } from './csg/iso'
import { DEFAULT_MATERIAL, gramsOf, MATERIALS } from './materials'
import type { CsgNode, PrimitiveSpec } from './csg/protocol'
import type { CadDocument, NewPart, SceneObject } from './document'

interface Field {
  key: string
  label: string
  min: number
  step: number
  max?: number
  integer?: boolean
  /** Free text instead of a number. */
  string?: boolean
  /** Renders a dropdown instead of a free number. */
  options?: { value: number; label: string }[]
}

const mm = (key: string, label: string): Field => ({ key, label, min: 0.1, step: 1 })
const SEGMENTS: Field = { key: 'segments', label: 'Segments', min: 3, max: 256, step: 1, integer: true }

const SIDES: Field = { key: 'sides', label: 'Sides', min: 3, max: 64, step: 1, integer: true }

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
  prism: [SIDES, mm('radius', 'Corner radius'), mm('height', 'Height')],
  pyramid: [SIDES, mm('radius', 'Corner radius'), mm('height', 'Height')],
  wedge: [mm('x', 'Length X'), mm('y', 'Depth Y'), mm('z', 'Height Z')],
  roundedBox: [mm('x', 'Width X'), mm('y', 'Depth Y'), mm('z', 'Height Z'), mm('radius', 'Corner radius'), SEGMENTS],
  dome: [mm('radius', 'Radius'), SEGMENTS],
  capsule: [mm('radius', 'Radius'), mm('length', 'Overall length'), SEGMENTS],
  pulley: [mm('diameter', 'Outer diameter'), mm('width', 'Width'), mm('grooveDepth', 'Groove depth'), { key: 'bore', label: 'Bore diameter', min: 0, step: 1 }],
  revolve: [
    { key: 'profile', label: 'Profile r,z', min: 0, step: 1, string: true },
    { key: 'angle', label: 'Angle (deg)', min: 1, max: 360, step: 15 },
    SEGMENTS,
  ],
  extrude: [
    { key: 'profile', label: 'Profile x,y', min: 0, step: 1, string: true },
    mm('height', 'Height'),
    { key: 'twist', label: 'Twist (deg)', min: -3600, max: 3600, step: 15 },
    { key: 'taper', label: 'Taper top scale', min: 0.01, max: 10, step: 0.1 },
  ],
  loft: [
    { key: 'bottom', label: 'Bottom x,y', min: 0, step: 1, string: true },
    { key: 'top', label: 'Top x,y', min: 0, step: 1, string: true },
    mm('height', 'Height'),
  ],
  arcSphere: [
    mm('radius', 'Radius'),
    { key: 'startZ', label: 'Bottom Z (mm)', min: -1000, step: 1 },
    { key: 'endZ', label: 'Top Z (mm)', min: -1000, step: 1 },
    SEGMENTS,
  ],
  pipe: [
    { key: 'path', label: 'Path x,y,z', min: 0, step: 1, string: true },
    mm('radius', 'Radius'),
    SEGMENTS,
  ],
  spring: [
    mm('coilRadius', 'Coil radius'),
    mm('wireRadius', 'Wire radius'),
    mm('pitch', 'Pitch per turn'),
    { key: 'turns', label: 'Turns', min: 0.5, max: 200, step: 0.5 },
    SEGMENTS,
  ],
  text: [{ key: 'text', label: 'Text', min: 0, step: 1, string: true }, mm('letterHeight', 'Letter height'), mm('thickness', 'Thickness')],
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

/** Volume (mm^3) and surface area (mm^2) of an object in world space. */
function measure(obj: SceneObject) {
  const { positions, indices } = obj.solid
  obj.mesh.updateMatrixWorld()
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const cross = new THREE.Vector3()
  let volume = 0
  let area = 0
  for (let t = 0; t < indices.length; t += 3) {
    a.fromArray(positions, indices[t] * 3).applyMatrix4(obj.mesh.matrixWorld)
    b.fromArray(positions, indices[t + 1] * 3).applyMatrix4(obj.mesh.matrixWorld)
    c.fromArray(positions, indices[t + 2] * 3).applyMatrix4(obj.mesh.matrixWorld)
    volume += a.dot(cross.crossVectors(b, c)) / 6
    area += cross.subVectors(b, a).cross(c.sub(a)).length() / 2
  }
  return { volume: Math.abs(volume), area }
}

const IDENTITY = new THREE.Matrix4().toArray()

/** Copy of `root` with the node at `path` (child indices) swapped for `next`. */
function replaceNode(root: CsgNode, path: readonly number[], next: CsgNode): CsgNode {
  if (path.length === 0) return next
  const [head, ...rest] = path
  return { ...root, children: root.children!.map((child, i) => (i === head ? replaceNode(child, rest, next) : child)) }
}

function nodeAt(root: CsgNode, path: readonly number[]): CsgNode | undefined {
  return path.reduce<CsgNode | undefined>((node, i) => node?.children?.[i], root)
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
  let syncTransform = () => {}
  /** Which history node is open for editing, remembered per object. */
  let editing: { objectId: number; path: number[] } | undefined

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
      const item = list.appendChild(el('div', `item${rank === 0 ? ' primary' : rank > 0 ? ' secondary' : ''}${obj.visible ? '' : ' hidden'}`))
      const eye = item.appendChild(el('span', 'eye', obj.visible ? '●' : '○'))
      eye.title = obj.visible ? 'Hide' : 'Show'
      eye.addEventListener('click', (e) => {
        e.stopPropagation()
        doc.toggleVisible(obj)
      })
      item.appendChild(el('span', 'name', obj.name))
      if (obj.groupId !== undefined) item.appendChild(el('span', 'tag', 'G' + obj.groupId))
      item.addEventListener('click', (e) => {
        const targets = e.altKey ? [obj] : doc.expandGroups([obj])
        if (!e.shiftKey) doc.select(targets)
        else if (rank !== -1) doc.select(doc.selection.filter((o) => !targets.includes(o)))
        else doc.select([...doc.selection, ...targets.filter((o) => !doc.selection.includes(o))])
      })
    }
  }

  const renderProps = () => {
    syncTransform = () => {}
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

    const colorRow = props.appendChild(el('label', 'row'))
    colorRow.appendChild(el('span', undefined, 'Color'))
    const color = colorRow.appendChild(el('input'))
    color.type = 'color'
    color.value = '#' + obj.color.toString(16).padStart(6, '0')
    color.addEventListener('change', () => {
      obj.color = parseInt(color.value.slice(1), 16)
      obj.mesh.material.color.setHex(obj.color)
      doc.commit()
    })

    const axes = ['x', 'y', 'z'] as const
    const { position, rotation, scale } = obj.mesh
    const deg = THREE.MathUtils.radToDeg
    const vectorRows = (title: string, read: (axis: 'x' | 'y' | 'z') => number, write: (axis: 'x' | 'y' | 'z', v: number) => void, field: Partial<Field>) => {
      props.appendChild(el('h3', undefined, title))
      return axes.map((axis) =>
        numberRow(props, axis.toUpperCase(), read(axis), field, (v) => {
          write(axis, v)
          doc.commit()
        }),
      )
    }
    const positionInputs = vectorRows('Position (mm)', (a) => position[a], (a, v) => (position[a] = v), { step: 1 })
    const rotationInputs = vectorRows('Rotation (deg)', (a) => deg(rotation[a]), (a, v) => (rotation[a] = THREE.MathUtils.degToRad(v)), { step: 15 })
    const scaleInputs = vectorRows('Scale', (a) => scale[a], (a, v) => {
      if (v === 0) throw new Error('Scale cannot be zero')
      scale[a] = v
    }, { step: 0.1 })
    syncTransform = () => {
      axes.forEach((a, i) => {
        positionInputs[i].value = String(+position[a].toFixed(3))
        rotationInputs[i].value = String(+deg(rotation[a]).toFixed(3))
        scaleInputs[i].value = String(+scale[a].toFixed(3))
      })
    }

    if (obj.spec) {
      const spec = obj.spec
      specRows('Dimensions (mm)', spec, async (next) => doc.replaceSolid(obj, await csg.primitive(next), next))
    }
    if (obj.tree) renderHistory(obj, obj.tree)

    const size = new THREE.Box3().setFromObject(obj.mesh).getSize(new THREE.Vector3())
    props.appendChild(el('h3', undefined, 'Info'))
    props.appendChild(el('p', 'hint', `Size ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} mm`))
    const materialRow = props.appendChild(el('label', 'row'))
    materialRow.appendChild(el('span', undefined, 'Material'))
    const materialSelect = materialRow.appendChild(el('select'))
    for (const m of MATERIALS) materialSelect.add(new Option(`${m.name} (${m.density} g/cm3)`, m.name))
    materialSelect.value = obj.material ?? DEFAULT_MATERIAL
    materialSelect.addEventListener('change', () => {
      obj.material = materialSelect.value
      doc.commit()
    })
    const { volume, area } = measure(obj)
    props.appendChild(el('p', 'hint', `Volume ${(volume / 1000).toFixed(2)} cm3, surface ${(area / 100).toFixed(2)} cm2, mass ${gramsOf(volume, obj.material).toFixed(1)} g`))
    props.appendChild(el('p', 'hint', `${obj.solid.indices.length / 3} triangles, ${obj.solid.positions.length / 3} vertices`))
  }

  const specRows = (title: string, spec: PrimitiveSpec, apply: (next: PrimitiveSpec) => Promise<void>) => {
    props.appendChild(el('h3', undefined, title))
    const values = spec as unknown as Record<string, number>
    for (const field of FIELDS[spec.kind]) {
      if (field.string) {
        const before = String(values[field.key])
        const row = props.appendChild(el('label', 'row'))
        row.appendChild(el('span', undefined, field.label))
        const input = row.appendChild(el('input'))
        input.value = before
        input.title = before
        input.addEventListener('change', async () => {
          try {
            const next = { ...spec, [field.key]: input.value } as PrimitiveSpec
            checkSpec(next)
            await apply(next)
          } catch (err) {
            status.textContent = `Error: ${err instanceof Error ? err.message : err}`
            input.value = before
          }
        })
        continue
      }
      numberRow(props, field.label, values[field.key], field, async (v) => {
        const value = Math.min(field.max ?? Infinity, Math.max(field.min, field.integer ? Math.round(v) : v))
        const next = { ...spec, [field.key]: value } as PrimitiveSpec
        checkSpec(next)
        await apply(next)
      })
    }
  }

  const renderHistory = (obj: SceneObject, tree: CsgNode) => {
    if (editing?.objectId !== obj.id || !nodeAt(tree, editing.path)) editing = undefined
    props.appendChild(el('h3', undefined, 'History'))

    const renderNode = (node: CsgNode, path: number[]) => {
      const open = editing !== undefined && editing.path.join() === path.join()
      const label = node.op ? `${node.op[0].toUpperCase()}${node.op.slice(1)}` : node.name
      const item = props.appendChild(el('div', `item node${open ? ' primary' : ''}${node.op ? ' op' : ''}`, label))
      item.style.marginLeft = `${path.length * 12}px`
      if (path.length > 0) {
        item.addEventListener('click', () => {
          editing = open ? undefined : { objectId: obj.id, path }
          renderProps()
        })
      }
      node.children?.forEach((child, i) => renderNode(child, [...path, i]))
    }
    renderNode(tree, [])

    const rebuild = async (path: number[], next: CsgNode) => {
      const updated = replaceNode(tree, path, next)
      doc.setTree(obj, await csg.evaluate(updated), updated)
    }

    const node = editing && nodeAt(tree, editing.path)
    if (editing && node) {
      const path = editing.path
      props.appendChild(el('h3', undefined, `${node.name}: offset (mm)`))
      ;(['X', 'Y', 'Z'] as const).forEach((axis, i) => {
        numberRow(props, axis, node.matrix[12 + i], { step: 1 }, (v) => {
          const matrix = [...node.matrix]
          matrix[12 + i] = v
          return rebuild(path, { ...node, matrix })
        })
      })
      if (node.spec) specRows(`${node.name}: dimensions (mm)`, node.spec, (spec) => rebuild(path, { ...node, spec }))
    } else {
      props.appendChild(el('p', 'hint', 'Click a part to edit it after the fact.'))
    }

    const ungroup = props.appendChild(el('button', undefined, 'Ungroup into parts'))
    ungroup.addEventListener('click', async () => {
      try {
        obj.mesh.updateMatrixWorld()
        const frame = obj.mesh.matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(tree.matrix))
        const parts: NewPart[] = []
        for (const child of tree.children ?? []) {
          const local = { ...child, matrix: IDENTITY }
          parts.push({
            name: child.name,
            color: obj.color,
            visible: obj.visible,
            solid: child.solid ?? (await csg.evaluate(local)),
            spec: child.spec,
            tree: child.op ? local : undefined,
            matrix: frame.clone().multiply(new THREE.Matrix4().fromArray(child.matrix)),
          })
        }
        doc.replaceWith(obj, parts)
      } catch (err) {
        status.textContent = `Error: ${err instanceof Error ? err.message : err}`
      }
    })
  }

  doc.addEventListener('change', () => {
    renderList()
    renderProps()
  })
  doc.addEventListener('transform', () => syncTransform())
  renderList()
  renderProps()
}
