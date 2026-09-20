import type { BooleanOp, CsgRequest, CsgResponse, Outline, PlacedSolid, PrimitiveSpec, SolidData } from './protocol'

const worker = new Worker(new URL('./csg.worker.ts', import.meta.url), { type: 'module' })
const pending = new Map<number, { resolve: (r: never) => void; reject: (e: Error) => void }>()
let nextId = 1

worker.onmessage = (e: MessageEvent<CsgResponse>) => {
  const res = e.data
  const p = pending.get(res.id)
  if (!p) return
  pending.delete(res.id)
  if (res.ok) p.resolve(res.result as never)
  else p.reject(new Error(res.error))
}

function call<T = SolidData>(req: CsgRequest): Promise<T> {
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker.postMessage({ id, req })
  })
}

export const csg = {
  primitive: (spec: PrimitiveSpec) => call({ type: 'primitive', spec }),
  validate: (solid: SolidData) => call({ type: 'validate', solid }),
  section: (parts: PlacedSolid[], z: number) => call<Outline[]>({ type: 'section', parts, z }),
  boolean: (op: BooleanOp, parts: PlacedSolid[]) => call({ type: 'boolean', op, parts }),
}
