import * as THREE from 'three'
import type { SceneObject } from '../document'

const csvCell = (value: string | number) => {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Bill of materials CSV: one row per object with name, colour, dimensions, volume (cm3), tris. */
export function encodeBom(objects: readonly SceneObject[]): ArrayBuffer {
  const rows = ['Name,Color,SizeX (mm),SizeY (mm),SizeZ (mm),Volume (cm3),Triangles,Group']
  const size = new THREE.Vector3()
  for (const obj of objects) {
    obj.mesh.updateMatrixWorld()
    new THREE.Box3().setFromObject(obj.mesh).getSize(size)
    let volume = 0
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
    const cross = new THREE.Vector3()
    for (let t = 0; t < obj.solid.indices.length; t += 3) {
      a.fromArray(obj.solid.positions, obj.solid.indices[t] * 3).applyMatrix4(obj.mesh.matrixWorld)
      b.fromArray(obj.solid.positions, obj.solid.indices[t + 1] * 3).applyMatrix4(obj.mesh.matrixWorld)
      c.fromArray(obj.solid.positions, obj.solid.indices[t + 2] * 3).applyMatrix4(obj.mesh.matrixWorld)
      volume += a.dot(cross.crossVectors(b, c)) / 6
    }
    rows.push(
      [
        csvCell(obj.name),
        '#' + obj.color.toString(16).padStart(6, '0'),
        csvCell(size.x.toFixed(2)),
        csvCell(size.y.toFixed(2)),
        csvCell(size.z.toFixed(2)),
        csvCell((Math.abs(volume) / 1000).toFixed(3)),
        obj.solid.indices.length / 3,
        obj.groupId ?? '',
      ].join(','),
    )
  }
  return new TextEncoder().encode(rows.join('\n') + '\n').buffer as ArrayBuffer
}
