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
  | { kind: 'prism'; sides: number; radius: number; height: number }
  | { kind: 'pyramid'; sides: number; radius: number; height: number }
  | { kind: 'wedge'; x: number; y: number; z: number }
  | { kind: 'roundedBox'; x: number; y: number; z: number; radius: number; segments: number }
  | { kind: 'dome'; radius: number; segments: number }
  | { kind: 'capsule'; radius: number; length: number; segments: number }
  | { kind: 'pulley'; diameter: number; width: number; grooveDepth: number; bore: number }
  /** `profile` is "radius,height" points; the outline is turned around the Z axis. */
  | { kind: 'revolve'; profile: string; angle: number; segments: number }
  /** `profile` is "x,y" points; `twist` is in degrees over the full height. */
  | { kind: 'extrude'; profile: string; height: number; twist: number }
  | { kind: 'text'; text: string; letterHeight: number; thickness: number }
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

/**
 * Node of a non-destructive CSG tree. A node is exactly one of: a parametric primitive (`spec`),
 * a fixed mesh (`solid`), or a boolean of its `children` (`op`). `matrix` places the node in its
 * parent's frame; primitives are centred on their bounding box before it is applied.
 */
export interface CsgNode {
  name: string
  matrix: number[]
  spec?: PrimitiveSpec
  solid?: SolidData
  op?: BooleanOp
  children?: CsgNode[]
}

/** Closed 2D loop of xy points. Outer loops are counter-clockwise, holes clockwise. */
export type Outline = [number, number][]

export type CsgRequest =
  | { type: 'primitive'; spec: PrimitiveSpec }
  /** Subtract nodes remove every later child from the first one. */
  | { type: 'evaluate'; node: CsgNode }
  | { type: 'validate'; solid: SolidData }
  /** Cross-section of the union of all parts at world height z. */
  | { type: 'section'; parts: PlacedSolid[]; z: number }

export type CsgResponse =
  | { id: number; ok: true; result: SolidData | Outline[] }
  | { id: number; ok: false; error: string }
