import * as THREE from 'three'
import type { CadDocument } from './document'
import type { ViewName, Viewport } from './viewport'

const SIZE_PX = 90
const AXIS_COLORS = [0xff5757, 0x66c76a, 0x5698ff] // X = red, Y = green, Z = blue

interface AxisPair {
  name: string
  view: ViewName
  vector: THREE.Vector3
}

// Six labels; two per axis so both directions are clickable.
const AXES: AxisPair[] = [
  { name: '+X', view: 'right', vector: new THREE.Vector3(1, 0, 0) },
  { name: '-X', view: 'right', vector: new THREE.Vector3(-1, 0, 0) },
  { name: '+Y', view: 'front', vector: new THREE.Vector3(0, 1, 0) },
  { name: '-Y', view: 'front', vector: new THREE.Vector3(0, -1, 0) },
  { name: '+Z', view: 'top', vector: new THREE.Vector3(0, 0, 1) },
  { name: '-Z', view: 'top', vector: new THREE.Vector3(0, 0, -1) },
]

function labelTexture(text: string, color: string): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(64, 64, 60, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#101318'
  ctx.font = 'bold 60px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 64, 68)
  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = 4
  return texture
}

/**
 * Small overlay showing a coloured X/Y/Z compass in the top-right corner. Rotates in sync with the
 * main camera; clicking a label snaps the main view to look along that axis.
 */
export function buildNavCube(hostViewport: HTMLElement, main: Viewport, doc: CadDocument) {
  const container = hostViewport.appendChild(Object.assign(document.createElement('div'), { className: 'navcube' }))
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(SIZE_PX, SIZE_PX)
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-2.5, 2.5, 2.5, -2.5, 0.1, 20)
  camera.position.set(0, 0, 8)
  camera.up.set(0, 1, 0)
  camera.lookAt(0, 0, 0)

  // Three lines radiating from the centre (positive halves only; negative labels sit at their own dots).
  const shaftGroup = new THREE.Group()
  scene.add(shaftGroup)
  for (let i = 0; i < 3; i++) {
    const dir = new THREE.Vector3()
    dir.setComponent(i, 1)
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(1.6)])
    shaftGroup.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: AXIS_COLORS[i] })))
  }

  const clickable: { sprite: THREE.Sprite; axis: AxisPair }[] = []
  for (const axis of AXES) {
    const material = new THREE.SpriteMaterial({
      map: labelTexture(axis.name, '#' + AXIS_COLORS[axis.vector.toArray().findIndex((v) => v !== 0)].toString(16).padStart(6, '0')),
      depthTest: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.position.copy(axis.vector).multiplyScalar(1.6)
    sprite.scale.set(0.9, 0.9, 1)
    scene.add(sprite)
    clickable.push({ sprite, axis })
  }

  const forward = new THREE.Vector3()
  const orientation = new THREE.Quaternion()
  const draw = () => {
    forward.copy(main.camera.position).sub(main.controls.target).normalize()
    // Cube world rotation should equal the main camera's inverse rotation so the axes stay visually anchored.
    orientation.copy(main.camera.quaternion).invert()
    shaftGroup.setRotationFromQuaternion(orientation)
    for (const { sprite, axis } of clickable) {
      sprite.position.copy(axis.vector).multiplyScalar(1.6).applyQuaternion(orientation)
    }
    renderer.render(scene, camera)
  }
  draw()

  // Redraw on any camera or scene change so the compass stays in sync.
  main.controls.addEventListener('change', draw)
  doc.addEventListener('change', draw)
  doc.addEventListener('transform', draw)

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  renderer.domElement.addEventListener('click', (e) => {
    const rect = renderer.domElement.getBoundingClientRect()
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const hit = raycaster.intersectObjects(clickable.map((c) => c.sprite), false)[0]
    if (!hit) return
    const clicked = clickable.find((c) => c.sprite === hit.object)!
    main.frame(doc.frameTargets, clicked.axis.view)
    draw()
  })
}
