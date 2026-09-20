import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'

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
  readonly outlinePass: OutlinePass
  private readonly gtaoPass: GTAOPass
  private readonly composer: EffectComposer
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
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
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
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.bias = -0.0005
    key.shadow.radius = 4
    // Wide shadow frustum so large scenes like the NYC skyline still cast full shadows.
    const cam = key.shadow.camera as THREE.OrthographicCamera
    cam.left = -250
    cam.right = 250
    cam.top = 250
    cam.bottom = -250
    cam.near = 0.5
    cam.far = 500
    cam.updateProjectionMatrix()
    this.scene.add(key)

    const grid = new THREE.GridHelper(200, 20, 0x556070, 0x343a44)
    grid.rotation.x = Math.PI / 2
    this.scene.add(grid)
    this.scene.add(new THREE.AxesHelper(30))

    // Invisible plane at Z = 0 catches shadows so objects appear grounded without hiding the grid.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.ShadowMaterial({ opacity: 0.35 }),
    )
    ground.receiveShadow = true
    this.scene.add(ground)

    // Post-processing pipeline: normal render + GTAO for depth in crevices + outline pass for selection.
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.gtaoPass = new GTAOPass(this.scene, this.camera, 1, 1)
    this.gtaoPass.blendIntensity = 0.6
    this.gtaoPass.updateGtaoMaterial({ radius: 4, thickness: 0.5, scale: 1 })
    this.composer.addPass(this.gtaoPass)
    this.outlinePass = new OutlinePass(new THREE.Vector2(1, 1), this.scene, this.camera)
    this.outlinePass.edgeStrength = 6
    this.outlinePass.edgeGlow = 0.6
    this.outlinePass.edgeThickness = 1.5
    this.outlinePass.visibleEdgeColor.set(0x4da3ff)
    this.outlinePass.hiddenEdgeColor.set(0x1e3d5c)
    this.composer.addPass(this.outlinePass)
    this.composer.addPass(new OutputPass())

    new ResizeObserver(() => this.resize()).observe(container)
    this.resize()
    let last = performance.now()
    this.renderer.setAnimationLoop(() => {
      const now = performance.now()
      const delta = (now - last) / 1000
      last = now
      if (this.turntableSpeed !== 0) this.orbit(this.turntableSpeed * delta)
      this.composer.render()
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
    this.composer.render()
    return this.renderer.domElement.toDataURL('image/png')
  }

  /** Renders at a fixed pixel size (useful for prints/blueprints) and restores the previous size. */
  offscreenShot(width: number, height: number): string {
    const previous = new THREE.Vector2()
    this.renderer.getSize(previous)
    const aspect = this.camera.aspect
    this.renderer.setSize(width, height, false)
    this.composer.setSize(width, height)
    this.outlinePass.setSize(width, height)
    this.gtaoPass.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    try {
      this.composer.render()
      return this.renderer.domElement.toDataURL('image/png')
    } finally {
      this.renderer.setSize(previous.x, previous.y, false)
      this.composer.setSize(previous.x, previous.y)
      this.outlinePass.setSize(previous.x, previous.y)
      this.gtaoPass.setSize(previous.x, previous.y)
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
    this.composer.setSize(w, h)
    this.outlinePass.setSize(w, h)
    this.gtaoPass.setSize(w, h)
  }
}
