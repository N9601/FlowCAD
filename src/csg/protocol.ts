/** Indexed, watertight triangle mesh. Positions are xyz triples. */
export interface SolidData {
  positions: Float32Array
  indices: Uint32Array
}

export type PrimitiveSpec =
  | { kind: 'cube'; x: number; y: number; z: number }
  | { kind: 'cylinder'; radius: number; height: number; segments: number }
  | { kind: 'sphere'; radius: number; segments: number }
  | { kind: 'cone'; radius: number; height: number; segments: number }
  | { kind: 'tube'; outerRadius: number; innerRadius: number; height: number; segments: number }
  | { kind: 'torus'; majorRadius: number; minorRadius: number; segments: number }

export type BooleanOp = 'union' | 'subtract' | 'intersect'

/** A solid plus the column-major 4x4 matrix that places it in world space. */
export interface PlacedSolid {
  solid: SolidData
  matrix: number[]
}

export type CsgRequest =
  | { type: 'primitive'; spec: PrimitiveSpec }
  | { type: 'boolean'; op: BooleanOp; a: PlacedSolid; b: PlacedSolid }
  | { type: 'validate'; solid: SolidData }

export type CsgResponse =
  | { id: number; ok: true; solid: SolidData }
  | { id: number; ok: false; error: string }
