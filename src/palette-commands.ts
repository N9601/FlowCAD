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
  push('edit.redo', 'Redo', 'forward history', () => doc.redo())
  push('edit.duplicate', 'Duplicate', 'copy clone', requireSelection('any', () => doc.duplicate()))
  push('edit.delete', 'Delete', 'remove erase', requireSelection('any', () => { doc.remove([...doc.selection]); doc.commit() }))
  push('edit.group', 'Group selection', 'link together', requireSelection('two', () => { doc.groupSelection() }))
  push('edit.ungroup', 'Ungroup', 'unlink', requireSelection('any', () => doc.ungroupSelection()))
  push('edit.hide', 'Hide selection', 'invisible', requireSelection('any', () => doc.selection.forEach((o) => o.visible && doc.toggleVisible(o))))
  push('edit.show-all', 'Show all objects', 'unhide reveal', () => doc.objects.forEach((o) => !o.visible && doc.toggleVisible(o)))

  push('view.fit', 'Fit view', 'zoom frame', () => view.frame(doc.frameTargets))
  push('view.iso', 'Iso view', 'perspective', () => view.frame(doc.frameTargets, 'iso'))
  push('view.top', 'Top view', 'orthographic', () => view.frame(doc.frameTargets, 'top'))
  push('view.front', 'Front view', 'orthographic', () => view.frame(doc.frameTargets, 'front'))
  push('view.right', 'Right view', 'orthographic', () => view.frame(doc.frameTargets, 'right'))
  push('view.xray', 'Toggle X-ray', 'transparent see-through', () => doc.toggleXray())
  push('view.spin', 'Toggle spin', 'turntable rotate', () => view.setTurntable(view.isTurntableRunning() ? 0 : 20))
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
