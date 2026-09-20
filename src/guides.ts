import * as THREE from 'three'
import type { CadDocument } from './document'
import type { Viewport } from './viewport'

const GUIDE_COLOR = 0xff9a2e
const ALIGN_TOLERANCE = 0.05
const GUIDE_EXTEND = 20

type Axis = 0 | 1 | 2

interface Guide {
  axis: Axis
  /** Value along the aligned axis; the guide runs perpendicular to it. */
  value: number
  min: THREE.Vector3
  max: THREE.Vector3
}

function pointsForGuide(g: Guide): [THREE.Vector3, THREE.Vector3] {
  const [a, b] = [g.min.clone(), g.max.clone()]
  return [a, b]
}

/**
 * Draws bright orange guide lines while the transform gizmo is translating; each guide highlights
 * an alignment (min/centre/max) between the moving object and a stationary one. Cleared when the
 * drag ends or the scene changes.
 */
export function buildAlignmentGuides(view: Viewport, doc: CadDocument) {
  const material = new THREE.LineBasicMaterial({ color: GUIDE_COLOR, depthTest: false, transparent: true, opacity: 0.9 })
  const holder = new THREE.Group()
  holder.renderOrder = 9
  view.scene.add(holder)

  const clear = () => {
    for (const child of [...holder.children]) {
      holder.remove(child)
      ;(child as THREE.Line).geometry.dispose()
    }
  }

  const refresh = () => {
    clear()
    const moving = doc.selection[0]
    // Guides only make sense mid-drag: exact-alignment matches would spam without the tolerance test.
    if (!moving || doc.selection.length !== 1) return
    const movingBox = new THREE.Box3().setFromObject(moving.mesh)
    if (movingBox.isEmpty()) return

    for (const other of doc.objects) {
      if (other === moving || !other.visible) continue
      const otherBox = new THREE.Box3().setFromObject(other.mesh)
      if (otherBox.isEmpty()) continue
      for (let axis = 0 as Axis; axis <= 2; axis = (axis + 1) as Axis) {
        // Anchor sets to compare on this axis: min, centre, max of each box.
        const movingSamples = [movingBox.min.getComponent(axis), (movingBox.min.getComponent(axis) + movingBox.max.getComponent(axis)) / 2, movingBox.max.getComponent(axis)]
        const otherSamples = [otherBox.min.getComponent(axis), (otherBox.min.getComponent(axis) + otherBox.max.getComponent(axis)) / 2, otherBox.max.getComponent(axis)]
        for (const m of movingSamples) {
          for (const o of otherSamples) {
            if (Math.abs(m - o) > ALIGN_TOLERANCE) continue
            const min = movingBox.min.clone().min(otherBox.min).setComponent(axis, m - GUIDE_EXTEND)
            const max = movingBox.max.clone().max(otherBox.max).setComponent(axis, m + GUIDE_EXTEND)
            const [p, q] = pointsForGuide({ axis, value: m, min, max })
            // Guide runs along `axis` between the two boxes' extremes on the other axes.
            // We collapse the other two axes to the shared alignment position; keep the moving axis extended.
            const otherAxes: Axis[] = [0, 1, 2].filter((a) => a !== axis) as Axis[]
            for (const oa of otherAxes) {
              // Use the shared coordinate on this axis if either min or max aligns; otherwise show midway line.
              const midway = ((movingBox.min.getComponent(oa) + movingBox.max.getComponent(oa)) / 2 + (otherBox.min.getComponent(oa) + otherBox.max.getComponent(oa)) / 2) / 2
              p.setComponent(oa, midway)
              q.setComponent(oa, midway)
            }
            const geometry = new THREE.BufferGeometry().setFromPoints([p, q])
            const line = new THREE.Line(geometry, material)
            line.renderOrder = 9
            holder.add(line)
            void o
          }
        }
      }
    }
  }

  doc.addEventListener('transform', refresh)
  doc.addEventListener('change', clear)
}
