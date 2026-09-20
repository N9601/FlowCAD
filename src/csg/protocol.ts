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
  | { kind: 'bolt'; size: number; length: number }
  | { kind: 'nut'; size: number; clearance: number }
  | { kind: 'rod'; size: number; length: number }
  | { kind: 'gear'; module: number; teeth: number; pressureAngle: number; thickness: number; bore: number }

export type BooleanOp = 'union' | 'subtract' | 'intersect'

/** A solid plus the column-major 4x4 matrix that places it in world space. */
export interface PlacedSolid {
  solid: SolidData
  matrix: number[]
}

/** Closed 2D loop of xy points. Outer loops are counter-clockwise, holes clockwise. */
export type Outline = [number, number][]

export type CsgRequest =
  | { type: 'primitive'; spec: PrimitiveSpec }
  /** Subtract removes every later part from the first one. */
  | { type: 'boolean'; op: BooleanOp; parts: PlacedSolid[] }
  | { type: 'validate'; solid: SolidData }
  /** Cross-section of the union of all parts at world height z. */
  | { type: 'section'; parts: PlacedSolid[]; z: number }

export type CsgResponse =
  | { id: number; ok: true; result: SolidData | Outline[] }
  | { id: number; ok: false; error: string }
