import * as THREE from 'three'
import type { CadDocument } from '../document'
import type { ViewName, Viewport } from '../viewport'

const CELL_W = 900
const CELL_H = 600
const GAP = 30
const MARGIN = 40
const TITLE_H = 120

const VIEW_ORDER: { name: ViewName; label: string; col: number; row: number }[] = [
  { name: 'top', label: 'TOP', col: 0, row: 0 },
  { name: 'iso', label: 'ISO', col: 1, row: 0 },
  { name: 'front', label: 'FRONT', col: 0, row: 1 },
  { name: 'right', label: 'RIGHT', col: 1, row: 1 },
]

function sceneBox(doc: CadDocument): THREE.Box3 {
  const box = new THREE.Box3()
  for (const obj of doc.objects) if (obj.visible) box.expandByObject(obj.mesh)
  if (box.isEmpty()) box.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))
  return box
}

const escapeXml = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * Renders the four standard views into one SVG page laid out as a classical drafting sheet
 * (TOP + ISO on top, FRONT + RIGHT below) with a title block on the right showing the overall
 * bounding-box dimensions. Each view is a PNG snapshot embedded as a data URL.
 */
export function encodeBlueprint(doc: CadDocument, view: Viewport, title = 'FlowCAD Drawing'): ArrayBuffer {
  const savedPosition = view.camera.position.clone()
  const savedTarget = view.controls.target.clone()

  // Snap each view, render at cell resolution, then restore the user's original camera.
  const snapshots: Record<string, string> = {}
  const frameTargets = doc.frameTargets
  for (const { name } of VIEW_ORDER) {
    view.frame(frameTargets, name)
    snapshots[name] = view.offscreenShot(CELL_W, CELL_H)
  }
  view.camera.position.copy(savedPosition)
  view.controls.target.copy(savedTarget)
  view.controls.update()

  const box = sceneBox(doc)
  const size = box.getSize(new THREE.Vector3())
  const totalW = MARGIN * 2 + CELL_W * 2 + GAP + TITLE_H * 3
  const totalH = MARGIN * 2 + CELL_H * 2 + GAP + TITLE_H

  const cells = VIEW_ORDER.map(({ name, label, col, row }) => {
    const x = MARGIN + col * (CELL_W + GAP)
    const y = MARGIN + row * (CELL_H + GAP)
    return [
      `<g transform="translate(${x} ${y})">`,
      `<rect width="${CELL_W}" height="${CELL_H}" fill="#f7f7f5" stroke="#1b1e23" stroke-width="1.5"/>`,
      `<image href="${snapshots[name]}" x="0" y="0" width="${CELL_W}" height="${CELL_H}" preserveAspectRatio="xMidYMid meet"/>`,
      `<text x="10" y="26" font-family="system-ui, sans-serif" font-size="18" font-weight="600" fill="#1b1e23">${label}</text>`,
      `</g>`,
    ].join('')
  })

  const titleX = MARGIN + CELL_W * 2 + GAP + 20
  const titleY = MARGIN
  const titleBlock = [
    `<g transform="translate(${titleX} ${titleY})">`,
    `<rect width="${TITLE_H * 3 - 40}" height="${CELL_H * 2 + GAP}" fill="#f7f7f5" stroke="#1b1e23" stroke-width="1.5"/>`,
    `<text x="16" y="34" font-family="system-ui, sans-serif" font-size="22" font-weight="700" fill="#1b1e23">${escapeXml(title)}</text>`,
    `<line x1="10" y1="52" x2="${TITLE_H * 3 - 50}" y2="52" stroke="#1b1e23" stroke-width="1"/>`,
    ...[
      ['Objects', String(doc.objects.length)],
      ['Overall X', `${size.x.toFixed(2)} mm`],
      ['Overall Y', `${size.y.toFixed(2)} mm`],
      ['Overall Z', `${size.z.toFixed(2)} mm`],
      ['Origin (min)', `${box.min.x.toFixed(1)}, ${box.min.y.toFixed(1)}, ${box.min.z.toFixed(1)}`],
      ['Origin (max)', `${box.max.x.toFixed(1)}, ${box.max.y.toFixed(1)}, ${box.max.z.toFixed(1)}`],
      ['Generated', new Date().toISOString().slice(0, 10)],
      ['Software', 'FlowCAD'],
      ['Units', 'millimetres'],
    ].flatMap(([label, value], i) => [
      `<text x="16" y="${88 + i * 28}" font-family="system-ui, sans-serif" font-size="12" fill="#6b6f77">${label}</text>`,
      `<text x="140" y="${88 + i * 28}" font-family="ui-monospace, Consolas, monospace" font-size="13" font-weight="600" fill="#1b1e23">${escapeXml(value)}</text>`,
    ]),
    `</g>`,
  ].join('')

  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">`,
    `<rect width="${totalW}" height="${totalH}" fill="#ffffff"/>`,
    ...cells,
    titleBlock,
    `</svg>`,
  ].join('\n')

  return new TextEncoder().encode(svg).buffer as ArrayBuffer
}
