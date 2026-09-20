import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import type { CsgNode, PlacedSolid, PrimitiveSpec, SolidData } from './csg/protocol'
import type { Viewport } from './viewport'

const CREASE_ANGLE = THREE.MathUtils.degToRad(35)
const COLOR = 0x8fa3b8
const COLOR_PRIMARY = 0x4da3ff
const COLOR_SECONDARY = 0xffa64d
const CLICK_SLOP_PX = 4
const MAX_HISTORY = 200

export interface SceneObject {
  id: number
  name: string
  solid: SolidData
  /** Present while the object is still an unmodified primitive, so its dimensions stay editable. */
  spec?: PrimitiveSpec
  /** Present on boolean results: how to rebuild `solid`, in the object's local frame. Never mutated. */
  tree?: CsgNode
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
}

interface ObjectState {
  id: number
  name: string
  solid: SolidData
  spec?: PrimitiveSpec
  tree?: CsgNode
}

/** Solids and trees are immutable once added, so snapshots share them by reference. */
type Snapshot = (ObjectState & { matrix: THREE.Matrix4 })[]

/** Plain-data form of the scene, safe for structured clone into IndexedDB. */
export type SavedDocument = (ObjectState & { matrix: number[] })[]

/** A new object described in world space, used when ungrouping. */
export type NewPart = Omit<ObjectState, 'id'> & { matrix: THREE.Matrix4 }

const geometryCache = new WeakMap<SolidData, THREE.BufferGeometry>()

/** Shifts the vertices so the bounding-box centre is the origin; returns the old centre and the box. */
function recentre(solid: SolidData) {
  const box = new THREE.Box3().setFromArray(solid.positions)
  const centre = box.getCenter(new THREE.Vector3())
  for (let i = 0; i < solid.positions.length; i += 3) {
    solid.positions[i] -= centre.x
    solid.positions[i + 1] -= centre.y
    solid.positions[i + 2] -= centre.z
  }
  return { box, centre }
}

function displayGeometry(solid: SolidData): THREE.BufferGeometry {
  const cached = geometryCache.get(solid)
  if (cached) return cached
  const indexed = new THREE.BufferGeometry()
  indexed.setAttribute('position', new THREE.BufferAttribute(solid.positions, 3))
  indexed.setIndex(new THREE.BufferAttribute(solid.indices, 1))
  const creased = toCreasedNormals(indexed, CREASE_ANGLE)
  indexed.dispose()
  geometryCache.set(solid, creased)
  return creased
}

export class CadDocument extends EventTarget {
  readonly objects: SceneObject[] = []
  /** Selection order matters: [0] is the boolean target, [1] the tool. */
  readonly selection: SceneObject[] = []
  private readonly view: Viewport
  private readonly gizmo: TransformControls
  private nextId = 1
  private history: Snapshot[] = [[]]
  private cursor = 0
  private xray = false
  /** Turned off while another tool (measure) owns clicks in the viewport. */
  pickingEnabled = true

  constructor(view: Viewport) {
    super()
    this.view = view

    this.gizmo = new TransformControls(view.camera, view.renderer.domElement)
    this.gizmo.setTranslationSnap(1)
    this.gizmo.setRotationSnap(THREE.MathUtils.degToRad(15))
    this.gizmo.setScaleSnap(0.1)
    const dragStart = new THREE.Matrix4()
    this.gizmo.addEventListener('dragging-changed', (e) => {
      view.controls.enabled = !e.value
      const mesh = this.gizmo.object
      if (!mesh) return
      mesh.updateMatrix()
      if (e.value) dragStart.copy(mesh.matrix)
      else if (!dragStart.equals(mesh.matrix)) this.commit()
    })
    this.gizmo.addEventListener('objectChange', () => this.dispatchEvent(new Event('transform')))
    view.scene.add(this.gizmo.getHelper())

    this.bindPicking(view.renderer.domElement)
  }

  /** Adds a solid whose vertices are in world space; the pivot is moved to its bounding-box centre. */
  add(name: string, solid: SolidData, spec?: PrimitiveSpec): SceneObject {
    const { box, centre } = recentre(solid)
    // New primitives are dropped on the origin, resting on the ground plane.
    if (spec) centre.set(0, 0, (box.max.z - box.min.z) / 2)
    const id = this.nextId++
    const obj = this.insert({ id, name: `${name} ${id}`, solid, spec, matrix: new THREE.Matrix4().setPosition(centre) })
    this.select([obj])
    return obj
  }

  /** Describes an object as a tree node in world space, for use as a boolean input. */
  nodeOf(obj: SceneObject): CsgNode {
    obj.mesh.updateMatrixWorld()
    const world = obj.mesh.matrixWorld
    if (obj.tree) {
      const matrix = world.clone().multiply(new THREE.Matrix4().fromArray(obj.tree.matrix)).toArray()
      return { ...obj.tree, name: obj.name, matrix }
    }
    const geometry = obj.spec ? { spec: obj.spec } : { solid: obj.solid }
    return { name: obj.name, matrix: world.toArray(), ...geometry }
  }

  /** Swaps in geometry rebuilt from an edited tree. The local frame is kept, so nothing jumps. */
  setTree(obj: SceneObject, solid: SolidData, tree: CsgNode) {
    obj.mesh.geometry.dispose()
    obj.solid = solid
    obj.tree = tree
    obj.mesh.geometry = displayGeometry(solid)
    this.commit()
  }

  /** Replaces an object with the given parts as one undo step. */
  replaceWith(obj: SceneObject, parts: readonly NewPart[]) {
    this.remove([obj])
    this.select(parts.map((part) => this.insert({ ...part, id: this.nextId++ })))
    this.commit()
  }

  /** Swaps in regenerated geometry, keeping the object's transform. */
  replaceSolid(obj: SceneObject, solid: SolidData, spec: PrimitiveSpec) {
    recentre(solid)
    const bottom = (o: SceneObject) => new THREE.Box3().setFromObject(o.mesh).min.z
    const before = bottom(obj)
    obj.mesh.geometry.dispose()
    obj.solid = solid
    obj.spec = spec
    obj.mesh.geometry = displayGeometry(solid)
    obj.mesh.position.z += before - bottom(obj)
    this.commit()
  }

  private insert({ matrix, ...state }: ObjectState & { matrix: THREE.Matrix4 }): SceneObject {
    const mesh = new THREE.Mesh(
      displayGeometry(state.solid),
      new THREE.MeshStandardMaterial({ color: COLOR, roughness: 0.55, metalness: 0.1 }),
    )
    matrix.decompose(mesh.position, mesh.quaternion, mesh.scale)
    this.applyXray(mesh.material)
    const obj: SceneObject = { ...state, mesh }
    this.objects.push(obj)
    this.view.scene.add(mesh)
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

  /** Meshes to frame: the selection, or everything when nothing is selected. */
  get frameTargets(): THREE.Object3D[] {
    return (this.selection.length > 0 ? this.selection : this.objects).map((o) => o.mesh)
  }

  toggleXray() {
    this.xray = !this.xray
    for (const obj of this.objects) this.applyXray(obj.mesh.material)
  }

  private applyXray(material: THREE.MeshStandardMaterial) {
    material.transparent = this.xray
    material.opacity = this.xray ? 0.35 : 1
    material.depthWrite = !this.xray
    material.side = this.xray ? THREE.DoubleSide : THREE.FrontSide
    material.needsUpdate = true
  }

  setGizmoMode(mode: 'translate' | 'rotate' | 'scale') {
    this.gizmo.setMode(mode)
  }

  /** Records the current state as one undo step. */
  commit() {
    const snapshot: Snapshot = this.objects.map((o) => {
      o.mesh.updateMatrix()
      return { id: o.id, name: o.name, solid: o.solid, spec: o.spec, tree: o.tree, matrix: o.mesh.matrix.clone() }
    })
    this.history.length = this.cursor + 1
    this.history.push(snapshot)
    if (this.history.length > MAX_HISTORY) this.history.shift()
    this.cursor = this.history.length - 1
    this.dispatchEvent(new Event('change'))
    this.dispatchEvent(new Event('saved-state'))
  }

  serialize(): SavedDocument {
    return this.history[this.cursor].map((s) => ({ ...s, matrix: s.matrix.toArray() }))
  }

  /** Replaces the scene with saved data and restarts the undo history from it. */
  load(saved: SavedDocument) {
    const snapshot: Snapshot = saved.map((s) => ({ ...s, matrix: new THREE.Matrix4().fromArray(s.matrix) }))
    this.nextId = Math.max(0, ...saved.map((s) => s.id)) + 1
    this.history = [snapshot]
    this.cursor = 0
    this.restore(snapshot)
  }

  /** Adds a copy of `src` at the given world matrix. Does not select it or record an undo step. */
  cloneAt(src: SceneObject, matrix: THREE.Matrix4): SceneObject {
    return this.insert({ id: this.nextId++, name: `${src.name} copy`, solid: src.solid, spec: src.spec, tree: src.tree, matrix })
  }

  /** Copies the selection, offset along X so the copies are visible. */
  duplicate() {
    const copies = this.selection.map((src) => {
      src.mesh.updateMatrix()
      const size = new THREE.Box3().setFromObject(src.mesh).getSize(new THREE.Vector3())
      const matrix = src.mesh.matrix.clone()
      matrix.elements[12] += size.x + 5
      return this.cloneAt(src, matrix)
    })
    if (copies.length === 0) return
    this.select(copies)
    this.commit()
  }

  get canUndo() {
    return this.cursor > 0
  }

  get canRedo() {
    return this.cursor < this.history.length - 1
  }

  undo() {
    if (!this.canUndo) return
    this.restore(this.history[--this.cursor])
    this.dispatchEvent(new Event('saved-state'))
  }

  redo() {
    if (!this.canRedo) return
    this.restore(this.history[++this.cursor])
    this.dispatchEvent(new Event('saved-state'))
  }

  private restore(snapshot: Snapshot) {
    this.remove([...this.objects])
    for (const s of snapshot) this.insert(s)
    this.select([])
  }

  placed(obj: SceneObject): PlacedSolid {
    obj.mesh.updateMatrixWorld()
    return { solid: obj.solid, matrix: obj.mesh.matrixWorld.toArray() }
  }

  /** Adds every object whose projected centre falls inside the screen-space box to the selection. */
  private selectInBox(rect: DOMRect, a: THREE.Vector2, b: THREE.Vector2) {
    const centre = new THREE.Vector3()
    const hits = this.objects.filter((obj) => {
      centre.setFromMatrixPosition(obj.mesh.matrixWorld).project(this.view.camera)
      if (centre.z > 1) return false
      const x = rect.left + ((centre.x + 1) / 2) * rect.width
      const y = rect.top + ((1 - centre.y) / 2) * rect.height
      return x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x) && y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y)
    })
    this.select([...this.selection, ...hits.filter((o) => !this.selection.includes(o))])
  }

  private bindPicking(dom: HTMLElement) {
    const raycaster = new THREE.Raycaster()
    const down = new THREE.Vector2()

    const marquee = document.createElement('div')
    marquee.className = 'marquee'
    marquee.hidden = true
    dom.parentElement!.appendChild(marquee)
    let boxing = false

    dom.addEventListener('pointerdown', (e) => {
      down.set(e.clientX, e.clientY)
      boxing = this.pickingEnabled && e.button === 0 && e.shiftKey && !this.gizmo.axis
      // Shift-drag draws a selection box instead of orbiting the camera.
      if (boxing) this.view.controls.enabled = false
    })
    dom.addEventListener('pointermove', (e) => {
      if (!boxing) return
      const rect = dom.getBoundingClientRect()
      marquee.hidden = down.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) <= CLICK_SLOP_PX
      marquee.style.left = `${Math.min(down.x, e.clientX) - rect.left}px`
      marquee.style.top = `${Math.min(down.y, e.clientY) - rect.top}px`
      marquee.style.width = `${Math.abs(e.clientX - down.x)}px`
      marquee.style.height = `${Math.abs(e.clientY - down.y)}px`
    })
    dom.addEventListener('pointerup', (e) => {
      if (boxing) {
        boxing = false
        this.view.controls.enabled = true
        if (!marquee.hidden) {
          marquee.hidden = true
          this.selectInBox(dom.getBoundingClientRect(), down, new THREE.Vector2(e.clientX, e.clientY))
          return
        }
      }
      if (!this.pickingEnabled || e.button !== 0 || this.gizmo.axis) return
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
