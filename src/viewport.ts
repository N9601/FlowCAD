import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// CAD convention: Z is up, units are millimetres.
THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

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

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container
    if (w === 0 || h === 0) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }
}
