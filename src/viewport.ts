import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// CAD convention: Z is up, units are millimetres.
THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

export type ViewName = 'iso' | 'top' | 'front' | 'right'

// Direction from the target towards the camera. Top is tilted a hair so "up" stays well defined.
const VIEW_DIRECTIONS: Record<ViewName, THREE.Vector3> = {
  iso: new THREE.Vector3(1, -1.3, 0.9).normalize(),
  top: new THREE.Vector3(0, -0.0001, 1).normalize(),
  front: new THREE.Vector3(0, -1, 0),
  right: new THREE.Vector3(1, 0, 0),
}

export class Viewport {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  readonly controls: OrbitControls
  private readonly container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
    this.scene.background = new THREE.Color(0x1b1e23)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000)
    this.camera.position.set(90, -120, 80)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0, 10)
    this.controls.update()

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f48, 1.6))
    const key = new THREE.DirectionalLight(0xffffff, 1.8)
    key.position.set(60, -80, 120)
    this.scene.add(key)

    const grid = new THREE.GridHelper(200, 20, 0x556070, 0x343a44)
    grid.rotation.x = Math.PI / 2
    this.scene.add(grid)
    this.scene.add(new THREE.AxesHelper(30))

    new ResizeObserver(() => this.resize()).observe(container)
    this.resize()
    this.renderer.setAnimationLoop(() => this.renderer.render(this.scene, this.camera))
  }

  /** Frames the given objects (or a default area when empty), optionally from a standard direction. */
  frame(objects: readonly THREE.Object3D[], view?: ViewName) {
    const box = new THREE.Box3()
    for (const object of objects) box.expandByObject(object)
    if (box.isEmpty()) box.set(new THREE.Vector3(-40, -40, 0), new THREE.Vector3(40, 40, 40))

    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2)
    const narrowest = Math.min(halfFov, Math.atan(Math.tan(halfFov) * this.camera.aspect))
    const distance = (sphere.radius / Math.sin(narrowest)) * 1.1
    const direction = view
      ? VIEW_DIRECTIONS[view]
      : this.camera.position.clone().sub(this.controls.target).normalize()

    this.controls.target.copy(sphere.center)
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance)
    this.controls.update()
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container
    if (w === 0 || h === 0) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }
}
