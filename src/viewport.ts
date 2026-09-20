import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

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

  /** Radians per second when the turntable is on; 0 means static. */
  private turntableSpeed = 0

  constructor(container: HTMLElement) {
    this.container = container
    this.scene.background = new THREE.Color(0x1b1e23)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000)
    this.camera.position.set(90, -120, 80)

    // preserveDrawingBuffer keeps the last frame available for canvas.toDataURL() screenshots.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0, 10)
    this.controls.update()

    // PMREM-baked room environment adds real reflections and soft-fill lighting to every material.
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.6

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f48, 0.6))
    const key = new THREE.DirectionalLight(0xffffff, 1.2)
    key.position.set(60, -80, 120)
    this.scene.add(key)

    const grid = new THREE.GridHelper(200, 20, 0x556070, 0x343a44)
    grid.rotation.x = Math.PI / 2
    this.scene.add(grid)
    this.scene.add(new THREE.AxesHelper(30))

    new ResizeObserver(() => this.resize()).observe(container)
    this.resize()
    let last = performance.now()
    this.renderer.setAnimationLoop(() => {
      const now = performance.now()
      const delta = (now - last) / 1000
      last = now
      if (this.turntableSpeed !== 0) this.orbit(this.turntableSpeed * delta)
      this.renderer.render(this.scene, this.camera)
    })
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

  /** Spins the camera around the current target by `angle` radians (positive = counter-clockwise viewed from +Z). */
  orbit(angle: number) {
    const offset = this.camera.position.clone().sub(this.controls.target)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    offset.set(offset.x * cos - offset.y * sin, offset.x * sin + offset.y * cos, offset.z)
    this.camera.position.copy(this.controls.target).add(offset)
    this.controls.update()
  }

  /** Toggles auto-rotation; degrees per second. */
  setTurntable(degreesPerSecond: number) {
    this.turntableSpeed = THREE.MathUtils.degToRad(degreesPerSecond)
  }

  isTurntableRunning() {
    return this.turntableSpeed !== 0
  }

  /** Renders one frame synchronously and returns the canvas PNG as a data URL. */
  screenshot(): string {
    this.renderer.render(this.scene, this.camera)
    return this.renderer.domElement.toDataURL('image/png')
  }

  /** Renders at a fixed pixel size (useful for prints/blueprints) and restores the previous size. */
  offscreenShot(width: number, height: number): string {
    const previous = new THREE.Vector2()
    this.renderer.getSize(previous)
    const aspect = this.camera.aspect
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    try {
      this.renderer.render(this.scene, this.camera)
      return this.renderer.domElement.toDataURL('image/png')
    } finally {
      this.renderer.setSize(previous.x, previous.y, false)
      this.camera.aspect = aspect
      this.camera.updateProjectionMatrix()
    }
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container
    if (w === 0 || h === 0) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }
}
