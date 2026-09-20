import * as THREE from 'three'
import type { CadDocument } from './document'
import { analyse, DEFAULT_PRINT_SETTINGS, flaggedGeometry, plaGrams, type PrintSettings } from './printcheck'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function buildPrintCheck(toolbar: HTMLElement, panel: HTMLElement, doc: CadDocument) {
  const settings: PrintSettings = structuredClone(DEFAULT_PRINT_SETTINGS)
  const section = panel.appendChild(el('section', 'printcheck'))
  section.hidden = true
  const overlays: THREE.Mesh[] = []
  // Drawn just in front of the surface it marks.
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })

  const clearOverlays = () => {
    for (const overlay of overlays.splice(0)) {
      overlay.removeFromParent()
      overlay.geometry.dispose()
    }
  }

  const settingRow = (parent: HTMLElement, label: string, value: number, step: number, apply: (v: number) => void) => {
    const row = parent.appendChild(el('label', 'row'))
    row.appendChild(el('span', undefined, label))
    const input = row.appendChild(el('input'))
    input.type = 'number'
    input.min = String(step)
    input.step = String(step)
    input.value = String(value)
    input.addEventListener('change', () => {
      if (Number.isFinite(input.valueAsNumber) && input.valueAsNumber > 0) apply(input.valueAsNumber)
      refresh()
    })
  }

  const refresh = () => {
    clearOverlays()
    if (section.hidden) return
    section.replaceChildren(el('h2', undefined, 'Print check'))

    const targets = doc.selection.length > 0 ? doc.selection : doc.objects
    if (targets.length === 0) section.appendChild(el('p', 'hint', 'Nothing to check yet.'))

    let totalIssues = 0
    let totalGrams = 0
    const started = performance.now()
    for (const obj of targets) {
      const report = analyse(obj, settings)
      totalIssues += report.issues.length
      totalGrams += plaGrams(report.volume)

      const geometry = flaggedGeometry(obj, report.flags)
      if (geometry) {
        const overlay = new THREE.Mesh(geometry, material)
        obj.mesh.add(overlay)
        overlays.push(overlay)
      }

      const ok = report.issues.length === 0
      section.appendChild(el('h3', ok ? 'pass' : 'fail', `${ok ? 'Ready' : `${report.issues.length} issue${report.issues.length > 1 ? 's' : ''}`}: ${obj.name}`))
      for (const issue of report.issues) section.appendChild(el('p', 'issue', issue))
      section.appendChild(el('p', 'hint', `Base area ${report.contactArea.toFixed(0)} mm2, about ${plaGrams(report.volume).toFixed(1)} g of PLA if solid`))
    }

    if (targets.length > 0) {
      const summary = totalIssues === 0 ? 'Everything checked is ready to print.' : `${totalIssues} issue${totalIssues > 1 ? 's' : ''} found. Red = needs support, amber = thin wall.`
      section.insertBefore(el('p', totalIssues === 0 ? 'hint pass' : 'hint', summary), section.children[1])
      section.appendChild(el('p', 'hint', `Total about ${totalGrams.toFixed(1)} g. Checked in ${(performance.now() - started).toFixed(0)} ms.`))
    }

    section.appendChild(el('h3', undefined, 'Printer'))
    settingRow(section, 'Max overhang (deg)', settings.overhangAngle, 5, (v) => (settings.overhangAngle = Math.min(89, v)))
    settingRow(section, 'Min wall (mm)', settings.minWall, 0.1, (v) => (settings.minWall = v))
    settingRow(section, 'Bed X (mm)', settings.bed.x, 10, (v) => (settings.bed.x = v))
    settingRow(section, 'Bed Y (mm)', settings.bed.y, 10, (v) => (settings.bed.y = v))
    settingRow(section, 'Max height (mm)', settings.bed.z, 10, (v) => (settings.bed.z = v))
  }

  const toggle = toolbar.appendChild(el('div', 'group')).appendChild(el('button', undefined, 'Print check'))
  toggle.addEventListener('click', () => {
    section.hidden = !section.hidden
    toggle.classList.toggle('active', !section.hidden)
    refresh()
    if (!section.hidden) section.scrollIntoView({ block: 'nearest' })
  })
  // Several change events can fire for one user action; analyse once per frame.
  let queued = false
  doc.addEventListener('change', () => {
    if (queued || section.hidden) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      refresh()
    })
  })
}
