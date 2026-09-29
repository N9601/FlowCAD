import type { CsgNode, CsgRequest, CsgResponse, Outline, PlacedSolid, PrimitiveSpec, SolidData } from './protocol'

const worker = new Worker(new URL('./csg.worker.ts', import.meta.url), { type: 'module' })
const pending = new Map<number, { resolve: (r: never) => void; reject: (e: Error) => void }>()
let nextId = 1
/** Set once the worker has died, so later calls fail at once instead of waiting forever. */
let failure: Error | undefined

// The worker answers every request, even failed ones, so an error event here means it could not
// load or has crashed. Nothing would ever reply, so reject what is outstanding.
worker.onerror = (e) => {
  failure = new Error(`The geometry kernel stopped (${e.message || 'the worker failed to load'}). Reload the page to restart it.`)
  for (const p of pending.values()) p.reject(failure)
  pending.clear()
}

worker.onmessage = (e: MessageEvent<CsgResponse>) => {
  const res = e.data
  const p = pending.get(res.id)
  if (!p) return
  pending.delete(res.id)
  if (res.ok) p.resolve(res.result as never)
  else p.reject(new Error(res.error))
}

function call<T = SolidData>(req: CsgRequest): Promise<T> {
  if (failure) return Promise.reject(failure)
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
  evaluate: (node: CsgNode) => call({ type: 'evaluate', node }),
}
