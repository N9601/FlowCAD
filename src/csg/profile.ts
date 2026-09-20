export type ProfilePoint = [number, number]

/**
 * Parses "x,y x,y ..." into a counter-clockwise outline. Pairs are separated by spaces or
 * semicolons. With `radial`, the first coordinate is a radius and may not be negative.
 */
export function parseProfile(text: string, radial: boolean): ProfilePoint[] {
  const points = text
    .trim()
    .split(/[\s;]+/)
    .filter(Boolean)
    .map((pair): ProfilePoint => {
      const [a, b, ...rest] = pair.split(',').map(Number)
      if (rest.length > 0 || !Number.isFinite(a) || !Number.isFinite(b)) {
        throw new Error(`"${pair}" is not a valid point. Write points as x,y separated by spaces`)
      }
      return [a, b]
    })
  if (points.length < 3) throw new Error('A profile needs at least 3 points')
  if (radial && points.some(([r]) => r < 0)) throw new Error('Revolve profile radii cannot be negative')

  const doubledArea = points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length]
    return sum + x * ny - nx * y
  }, 0)
  if (Math.abs(doubledArea) < 1e-9) throw new Error('Profile has no area')
  return doubledArea < 0 ? points.reverse() : points
}
