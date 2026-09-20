import type { BooleanOp, CsgRequest, CsgResponse, PlacedSolid, PrimitiveSpec, SolidData } from './protocol'

const worker = new Worker(new URL('./csg.worker.ts', import.meta.url), { type: 'module' })
const pending = new Map<number, { resolve: (s: SolidData) => void; reject: (e: Error) => void }>()
let nextId = 1

worker.onmessage = (e: MessageEvent<CsgResponse>) => {
  const res = e.data
  const p = pending.get(res.id)
  if (!p) return
  pending.delete(res.id)
  if (res.ok) p.resolve(res.solid)
  else p.reject(new Error(res.error))
}

function call(req: CsgRequest): Promise<SolidData> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker.postMessage({ id, req })
  })
}

export const csg = {
  primitive: (spec: PrimitiveSpec) => call({ type: 'primitive', spec }),
  validate: (solid: SolidData) => call({ type: 'validate', solid }),
  boolean: (op: BooleanOp, a: PlacedSolid, b: PlacedSolid) => call({ type: 'boolean', op, a, b }),
}
