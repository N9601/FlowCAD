import type { Outline } from '../csg/protocol'

const fmt = (n: number) => String(+n.toFixed(4))

function bounds(outlines: readonly Outline[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of outlines.flat()) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return { minX, minY, maxX, maxY }
}

/** 1:1 millimetre SVG. Y is flipped because SVG's Y axis points down. */
export function encodeSvg(outlines: readonly Outline[]): ArrayBuffer {
  const margin = 1
  const b = bounds(outlines)
  const width = b.maxX - b.minX + 2 * margin
  const height = b.maxY - b.minY + 2 * margin
  const path = outlines
    .map((o) => `M${o.map(([x, y]) => `${fmt(x - b.minX + margin)} ${fmt(b.maxY - y + margin)}`).join('L')}Z`)
    .join('')
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}mm" height="${fmt(height)}mm" viewBox="0 0 ${fmt(width)} ${fmt(height)}">`,
    `<path d="${path}" fill="none" stroke="#000" stroke-width="0.1" fill-rule="evenodd"/>`,
    '</svg>',
  ].join('\n')
  return new TextEncoder().encode(svg).buffer as ArrayBuffer
}

/** Minimal R12 DXF: one closed POLYLINE per outline, units in millimetres. */
export function encodeDxf(outlines: readonly Outline[]): ArrayBuffer {
  const out: (string | number)[] = [0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES']
  for (const outline of outlines) {
    out.push(0, 'POLYLINE', 8, 'SECTION', 66, 1, 70, 1)
    for (const [x, y] of outline) out.push(0, 'VERTEX', 8, 'SECTION', 10, fmt(x), 20, fmt(y))
    out.push(0, 'SEQEND')
  }
  out.push(0, 'ENDSEC', 0, 'EOF')
  return new TextEncoder().encode(out.join('\n') + '\n').buffer as ArrayBuffer
}
