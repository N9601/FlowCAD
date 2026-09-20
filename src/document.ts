import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import type { PlacedSolid, SolidData } from './csg/protocol'
import type { Viewport } from './viewport'

const CREASE_ANGLE = THREE.MathUtils.degToRad(35)
const COLOR = 0x8fa3b8
const COLOR_PRIMARY = 0x4da3ff
const COLOR_SECONDARY = 0xffa64d
const CLICK_SLOP_PX = 4

export interface SceneObject {
  id: number
  name: string
  solid: SolidData
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
}

function displayGeometry(solid: SolidData): THREE.BufferGeometry {
  const indexed = new THREE.BufferGeometry()
  indexed.setAttribute('position', new THREE.BufferAttribute(solid.positions, 3))
  indexed.setIndex(new THREE.BufferAttribute(solid.indices, 1))
  const creased = toCreasedNormals(indexed, CREASE_ANGLE)
  indexed.dispose()
  return creased
}

export class CadDocument extends EventTarget {
  readonly objects: SceneObject[] = []
  /** Selection order matters: [0] is the boolean target, [1] the tool. */
  readonly selection: SceneObject[] = []
  private readonly view: Viewport
  private readonly gizmo: TransformControls
  private nextId = 1

  constructor(view: Viewport) {
    super()
    this.view = view

    this.gizmo = new TransformControls(view.camera, view.renderer.domElement)
    this.gizmo.setTranslationSnap(1)
    this.gizmo.addEventListener('dragging-changed', (e) => {
      view.controls.enabled = !e.value
    })
    view.scene.add(this.gizmo.getHelper())

    this.bindPicking(view.renderer.domElement)
  }

  /** Adds a solid whose vertices are in world space; the pivot is moved to its bounding-box centre. */
  add(name: string, solid: SolidData, restOnGround = false): SceneObject {
    const box = new THREE.Box3().setFromArray(solid.positions)
    const centre = box.getCenter(new THREE.Vector3())
    for (let i = 0; i < solid.positions.length; i += 3) {
      solid.positions[i] -= centre.x
      solid.positions[i + 1] -= centre.y
      solid.positions[i + 2] -= centre.z
    }

    const mesh = new THREE.Mesh(
      displayGeometry(solid),
      new THREE.MeshStandardMaterial({ color: COLOR, roughness: 0.55, metalness: 0.1 }),
    )
    mesh.position.copy(centre)
    if (restOnGround) mesh.position.z = (box.max.z - box.min.z) / 2

    const id = this.nextId++
    const obj: SceneObject = { id, name: `${name} ${id}`, solid, mesh }
    this.objects.push(obj)
    this.view.scene.add(mesh)
    this.select([obj])
    return obj
  }

  remove(targets: readonly SceneObject[]) {
    for (const obj of targets) {
      const i = this.objects.indexOf(obj)
      if (i === -1) continue
      this.objects.splice(i, 1)
      this.view.scene.remove(obj.mesh)
      obj.mesh.geometry.dispose()
      obj.mesh.material.dispose()
    }
    this.select(this.selection.filter((o) => !targets.includes(o)))
  }

  select(objs: readonly SceneObject[]) {
    this.selection.splice(0, this.selection.length, ...objs)
    for (const obj of this.objects) {
      const rank = this.selection.indexOf(obj)
      obj.mesh.material.color.setHex(rank === -1 ? COLOR : rank === 0 ? COLOR_PRIMARY : COLOR_SECONDARY)
    }
    const last = this.selection.at(-1)
    if (last) this.gizmo.attach(last.mesh)
    else this.gizmo.detach()
    this.dispatchEvent(new Event('change'))
  }

  placed(obj: SceneObject): PlacedSolid {
    obj.mesh.updateMatrixWorld()
    return { solid: obj.solid, matrix: obj.mesh.matrixWorld.toArray() }
  }

  private bindPicking(dom: HTMLElement) {
    const raycaster = new THREE.Raycaster()
    const down = new THREE.Vector2()

    dom.addEventListener('pointerdown', (e) => down.set(e.clientX, e.clientY))
    dom.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || this.gizmo.axis) return
      if (down.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > CLICK_SLOP_PX) return

      const rect = dom.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, this.view.camera)
      const hit = raycaster.intersectObjects(this.objects.map((o) => o.mesh), false)[0]
      const obj = hit && this.objects.find((o) => o.mesh === hit.object)

      if (!obj) this.select([])
      else if (!e.shiftKey) this.select([obj])
      else if (this.selection.includes(obj)) this.select(this.selection.filter((o) => o !== obj))
      else this.select([...this.selection, obj])
    })
  }
}
