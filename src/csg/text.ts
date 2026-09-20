import type { Font } from 'opentype.js'

const CURVE_STEPS = 8

type Point = [number, number]

/**
 * Glyph outlines for a line of text as closed loops, in mm, Y up.
 * `letterHeight` is the height of a capital letter, which is what people measure on a part.
 */
export function textContours(font: Font, text: string, letterHeight: number): Point[][] {
  const capHeight = font.tables.os2?.sCapHeight || font.unitsPerEm * 0.7
  const fontSize = (letterHeight * font.unitsPerEm) / capHeight

  const contours: Point[][] = []
  let loop: Point[] = []
  let pen: Point = [0, 0]
  const close = () => {
    if (loop.length >= 3) contours.push(loop)
    loop = []
  }
  // opentype's Y axis points down, so every Y is negated.
  const curve = (at: (t: number) => Point) => {
    for (let i = 1; i <= CURVE_STEPS; i++) loop.push(at(i / CURVE_STEPS))
  }

  // Glyphs are placed by hand: opentype's own layout runs a ligature pass that throws on some fonts.
  const glyphs = [...text].map((char) => font.charToGlyph(char))
  const scale = fontSize / font.unitsPerEm
  let x = 0
  const commands = glyphs.flatMap((glyph, i) => {
    if (i > 0) x += font.getKerningValue(glyphs[i - 1], glyph) * scale
    const path = glyph.getPath(x, 0, fontSize)
    x += (glyph.advanceWidth ?? 0) * scale
    return path.commands
  })

  for (const cmd of commands) {
    if (cmd.type === 'M') {
      close()
      loop.push([cmd.x, -cmd.y])
    } else if (cmd.type === 'L') {
      loop.push([cmd.x, -cmd.y])
    } else if (cmd.type === 'Q') {
      const [p0, p1, p2]: Point[] = [pen, [cmd.x1, -cmd.y1], [cmd.x, -cmd.y]]
      curve((t) => {
        const u = 1 - t
        return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]
      })
    } else if (cmd.type === 'C') {
      const [p0, p1, p2, p3]: Point[] = [pen, [cmd.x1, -cmd.y1], [cmd.x2, -cmd.y2], [cmd.x, -cmd.y]]
      curve((t) => {
        const u = 1 - t
        const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
        return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]
      })
    } else {
      close()
    }
    if (cmd.type !== 'Z') pen = [cmd.x, -cmd.y]
  }
  close()
  return contours
}
