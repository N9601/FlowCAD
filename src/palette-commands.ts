import { chamfer, combine, fillet } from './actions'
import { CATEGORIES } from './catalog'
import type { CadDocument } from './document'
import { encodeBlueprint } from './io/blueprint'
import { encodeBom } from './io/bom'
import { encode3mf, encodeObj, type NamedPart } from './io/mesh-formats'
import { encodeGlb } from './io/gltf'
import { encodePly } from './io/ply'
import { encodeProject } from './io/project'
import { encodeDxf, encodeSvg } from './io/section'
import { csg } from './csg/client'
import { download, encodeBinaryStl } from './io/stl'
import type { Viewport } from './viewport'
import { addShape } from './actions'
import * as THREE from 'three'
import { settleWithPhysics } from './physics'
import { encodeStandaloneHtml } from './io/html'
import { recordTurntable } from './record'

export interface Command {
  id: string
  label: string
  keywords: string
  run: () => void | Promise<void>
}

/**
 * Everything the palette can do. Kept in one place so a new feature only needs one entry to become
 * searchable from Ctrl+K.
 */
export function buildCommandRegistry(doc: CadDocument, view: Viewport, status: HTMLElement): Command[] {
  const commands: Command[] = []
  const push = (id: string, label: string, keywords: string, run: () => void | Promise<void>) =>
    commands.push({ id, label, keywords: `${label} ${keywords}`.toLowerCase(), run })

  const requireSelection = (n: 'one' | 'any' | 'two', run: () => void | Promise<void>) => async () => {
    const s = doc.selection
    if (n === 'one' && s.length !== 1) throw new Error('Select exactly one object first')
    if (n === 'two' && s.length < 2) throw new Error('Select at least two objects first')
    if (n === 'any' && s.length === 0) throw new Error('Select at least one object first')
    await run()
  }

  for (const { title, shapes } of CATEGORIES) {
    for (const { label, spec } of shapes) {
      push(`add.${spec.kind}`, `Add ${label}`, `${title} primitive create ${spec.kind}`, async () => {
        await addShape(doc, label, spec)
        doc.commit()
      })
    }
  }

  push('op.union', 'Union', 'boolean combine merge', requireSelection('two', async () => {
    await combine(doc, 'union', doc.selection)
    doc.commit()
  }))
  push('op.subtract', 'Subtract', 'boolean cut hole', requireSelection('two', async () => {
    await combine(doc, 'subtract', doc.selection)
    doc.commit()
  }))
  push('op.intersect', 'Intersect', 'boolean common', requireSelection('two', async () => {
    await combine(doc, 'intersect', doc.selection)
    doc.commit()
  }))
  push('op.fillet2', 'Fillet 2 mm', 'round edge blend', requireSelection('one', async () => {
    await fillet(doc, doc.selection[0], 2)
    doc.commit()
  }))
  push('op.chamfer2', 'Chamfer 2 mm', 'bevel edge', requireSelection('one', async () => {
    await chamfer(doc, doc.selection[0], 2)
    doc.commit()
  }))

  push('edit.undo', 'Undo', 'back revert history', () => doc.undo())
  push('edit.settle', 'Physics settle', 'drop gravity fall pack', () => settleWithPhysics(doc))
  push('edit.surprise', 'Surprise me', 'random shapes fun demo', async () => {
    doc.remove([...doc.objects])
    const all = CATEGORIES.flatMap((c) => c.shapes)
    const pick = () => all[Math.floor(Math.random() * all.length)]
    for (let i = 0; i < 8; i++) {
      const shape = pick()
      const obj = await addShape(doc, shape.label, shape.spec)
      obj.mesh.position.set((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, obj.mesh.position.z)
      obj.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
    }
    doc.commit()
    view.frame(doc.frameTargets)
    status.textContent = `Surprise: ${doc.objects.length} random shapes`
  })
  push('edit.redo', 'Redo', 'forward history', () => doc.redo())
  push('edit.duplicate', 'Duplicate', 'copy clone', requireSelection('any', () => doc.duplicate()))

  const arrayLinear = (axis: 'x' | 'y' | 'z', axisName: string) => requireSelection('any', () => {
    const countStr = prompt(`Array along ${axisName}: how many copies (including original)?`, '5')
    if (!countStr) return
    const count = Math.max(2, Math.floor(+countStr))
    const spacingStr = prompt(`Spacing between copies in mm?`, '20')
    if (!spacingStr) return
    const spacing = +spacingStr
    if (!isFinite(spacing) || spacing === 0) throw new Error('Spacing must be a nonzero number')
    const dir = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)
    const copies = doc.arrayLinear([...doc.selection], dir, count, spacing)
    status.textContent = `Array on ${axisName}: added ${copies.length} copies`
  })
  push('edit.array.x', 'Array along X', 'linear pattern grid repeat clone', arrayLinear('x', 'X'))
  push('edit.array.y', 'Array along Y', 'linear pattern grid repeat clone', arrayLinear('y', 'Y'))
  push('edit.array.z', 'Array along Z', 'linear pattern grid repeat clone stack', arrayLinear('z', 'Z'))

  push('edit.array.polar', 'Polar array (around Z)', 'circular pattern rotate clone repeat', requireSelection('any', () => {
    const countStr = prompt('Polar array: how many total copies (including original)?', '6')
    if (!countStr) return
    const count = Math.max(2, Math.floor(+countStr))
    const angleStr = prompt('Total sweep in degrees (360 for full circle)?', '360')
    if (!angleStr) return
    const totalDeg = +angleStr
    if (!isFinite(totalDeg) || totalDeg === 0) throw new Error('Angle must be nonzero')
    const box = new THREE.Box3()
    for (const o of doc.selection) box.expandByObject(o.mesh)
    const centre = box.getCenter(new THREE.Vector3())
    const copies = doc.arrayPolar([...doc.selection], centre, count, totalDeg)
    status.textContent = `Polar array: added ${copies.length} copies across ${totalDeg} deg`
  }))
  push('edit.delete', 'Delete', 'remove erase', requireSelection('any', () => { doc.remove([...doc.selection]); doc.commit() }))
  push('edit.group', 'Group selection', 'link together', requireSelection('two', () => { doc.groupSelection() }))
  push('edit.ungroup', 'Ungroup', 'unlink', requireSelection('any', () => doc.ungroupSelection()))
  push('edit.hide', 'Hide selection', 'invisible', requireSelection('any', () => doc.selection.forEach((o) => o.visible && doc.toggleVisible(o))))
  push('edit.show-all', 'Show all objects', 'unhide reveal', () => doc.objects.forEach((o) => !o.visible && doc.toggleVisible(o)))
  push('edit.isolate', 'Isolate selection', 'hide others focus solo', requireSelection('any', () => {
    const keep = new Set(doc.selection)
    let hidden = 0
    for (const o of doc.objects) {
      if (o.visible && !keep.has(o)) { doc.toggleVisible(o); hidden++ }
    }
    status.textContent = `Isolated ${keep.size} object(s); hid ${hidden}`
  }))

  push('view.fit', 'Fit view', 'zoom frame', () => view.frame(doc.frameTargets))
  push('view.iso', 'Iso view', 'perspective', () => view.frame(doc.frameTargets, 'iso'))
  push('view.top', 'Top view', 'orthographic', () => view.frame(doc.frameTargets, 'top'))
  push('view.front', 'Front view', 'orthographic', () => view.frame(doc.frameTargets, 'front'))
  push('view.right', 'Right view', 'orthographic', () => view.frame(doc.frameTargets, 'right'))
  push('view.xray', 'Toggle X-ray', 'transparent see-through', () => doc.toggleXray())
  push('view.spin', 'Toggle spin', 'turntable rotate', () => view.setTurntable(view.isTurntableRunning() ? 0 : 20))
  push('view.record', 'Record turntable (WebM)', 'video capture animation spin', () => recordTurntable(view, status))
  push('view.snapshot', 'Snapshot to PNG', 'save image screenshot', () => {
    download(new TextEncoder().encode('').buffer as ArrayBuffer, '') // no-op, real snap below
    const url = view.screenshot()
    const a = Object.assign(document.createElement('a'), { href: url, download: 'flowcad-view.png' })
    a.click()
  })

  const parts = (): NamedPart[] => {
    const targets = doc.selection.length > 0 ? doc.selection : doc.objects
    return targets.map((o) => ({ name: o.name, ...({ solid: o.solid, matrix: (o.mesh.updateMatrixWorld(), o.mesh.matrixWorld.toArray()) }) }))
  }
  push('file.new', 'New scene', 'clear reset', () => { doc.remove([...doc.objects]); doc.commit() })
  push('file.save', 'Save project (.flowcad)', 'export json', () => {
    download(encodeProject(doc.serialize()), 'project.flowcad')
    status.textContent = `Saved ${doc.objects.length} object(s) to project.flowcad`
  })
  push('file.share-html', 'Share as HTML', 'export standalone shareable web viewer', () => {
    download(encodeStandaloneHtml(doc), 'flowcad-share.html')
    status.textContent = 'Exported standalone HTML viewer (open in any browser)'
  })
  push('file.blueprint', 'Export blueprint (4-view SVG)', 'drawing print', () => {
    download(encodeBlueprint(doc, view), 'flowcad-blueprint.svg')
    status.textContent = 'Exported 4-view blueprint'
  })
  push('file.bom', 'Export BOM (CSV)', 'bill of materials list', () => {
    download(encodeBom(doc.objects), 'flowcad-bom.csv')
    status.textContent = `Exported BOM for ${doc.objects.length} object(s)`
  })
  for (const [ext, encode] of [
    ['stl', encodeBinaryStl],
    ['obj', encodeObj],
    ['3mf', encode3mf],
    ['glb', encodeGlb],
    ['ply', encodePly],
  ] as const) {
    push(`export.${ext}`, `Export ${ext.toUpperCase()}`, `mesh save ${ext}`, () => {
      download(encode(parts()), `flowcad.${ext}`)
      status.textContent = `Exported ${parts().length} object(s) to flowcad.${ext}`
    })
  }
  push('export.svg', 'Export section (SVG)', 'laser cutter drawing', async () => {
    const outlines = await csg.section(parts(), 5)
    download(encodeSvg(outlines), 'flowcad-section.svg')
  })
  push('export.dxf', 'Export section (DXF)', 'cnc drawing', async () => {
    const outlines = await csg.section(parts(), 5)
    download(encodeDxf(outlines), 'flowcad-section.dxf')
  })

  return commands
}
