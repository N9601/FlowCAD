const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Writes an uncompressed (stored) ZIP archive. */
export function zip(files: { path: string; text: string }[]): ArrayBuffer {
  const encoder = new TextEncoder()
  const entries = files.map((f) => {
    const name = encoder.encode(f.path)
    const data = encoder.encode(f.text)
    return { name, data, crc: crc32(data), offset: 0 }
  })

  const localSize = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0)
  const centralSize = entries.reduce((n, e) => n + 46 + e.name.length, 0)
  const bytes = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(bytes.buffer)
  let at = 0

  const header = (signature: number, e: (typeof entries)[number], central: boolean) => {
    view.setUint32(at, signature, true)
    at += 4
    if (central) {
      view.setUint16(at, 20, true)
      at += 2
    }
    view.setUint16(at, 20, true)
    view.setUint16(at + 2, 0x0800, true) // UTF-8 names
    view.setUint32(at + 10, e.crc, true)
    view.setUint32(at + 14, e.data.length, true)
    view.setUint32(at + 18, e.data.length, true)
    view.setUint16(at + 22, e.name.length, true)
    at += 26
    if (central) {
      view.setUint32(at + 10, e.offset, true)
      at += 14
    }
    bytes.set(e.name, at)
    at += e.name.length
  }

  for (const e of entries) {
    e.offset = at
    header(0x04034b50, e, false)
    bytes.set(e.data, at)
    at += e.data.length
  }
  const centralStart = at
  for (const e of entries) header(0x02014b50, e, true)

  view.setUint32(at, 0x06054b50, true)
  view.setUint16(at + 8, entries.length, true)
  view.setUint16(at + 10, entries.length, true)
  view.setUint32(at + 12, at - centralStart, true)
  view.setUint32(at + 16, centralStart, true)
  return bytes.buffer
}
