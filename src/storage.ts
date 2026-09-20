const DB_NAME = 'flowcad'
const STORE = 'documents'
const KEY = 'autosave'
const SNAPSHOT_PREFIX = 'snap-'
const MAX_SNAPSHOTS = 10
const SNAPSHOT_MIN_INTERVAL_MS = 60_000

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = action(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export interface Snapshot<T> {
  id: string
  createdAt: number
  data: T
}

async function listKeys(): Promise<string[]> {
  const keys = await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
  return keys.filter((k): k is string => typeof k === 'string' && k.startsWith(SNAPSHOT_PREFIX)).sort()
}

let lastSnapshotAt = 0

export const autosave = {
  load: <T>() => run<T | undefined>('readonly', (s) => s.get(KEY)),
  save: (data: unknown) => run('readwrite', (s) => s.put(data, KEY)),
}

export const snapshots = {
  /** Records a snapshot if the last one was at least a minute ago; keeps a rolling window of 10. */
  async record(data: unknown) {
    const now = Date.now()
    if (now - lastSnapshotAt < SNAPSHOT_MIN_INTERVAL_MS) return
    lastSnapshotAt = now
    const id = `${SNAPSHOT_PREFIX}${now}`
    await run('readwrite', (s) => s.put(data, id))
    const keys = await listKeys()
    if (keys.length > MAX_SNAPSHOTS) {
      const stale = keys.slice(0, keys.length - MAX_SNAPSHOTS)
      await run('readwrite', (store) => {
        for (const k of stale) store.delete(k)
        return store.count()
      })
    }
  },
  async list<T>(): Promise<Snapshot<T>[]> {
    const keys = await listKeys()
    const entries: Snapshot<T>[] = []
    for (const id of keys.reverse()) {
      const data = await run<T | undefined>('readonly', (s) => s.get(id))
      if (data !== undefined) entries.push({ id, createdAt: Number(id.slice(SNAPSHOT_PREFIX.length)), data })
    }
    return entries
  },
}
