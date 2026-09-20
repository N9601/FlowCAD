/** ISO 261 coarse pitch, ISO 4017 hex head, ISO 4032 nut. All values in mm. */
export interface MetricSize {
  d: number
  pitch: number
  acrossFlats: number
  headHeight: number
  nutHeight: number
}

export const METRIC_SIZES: MetricSize[] = [
  { d: 2, pitch: 0.4, acrossFlats: 4, headHeight: 1.4, nutHeight: 1.6 },
  { d: 2.5, pitch: 0.45, acrossFlats: 5, headHeight: 1.7, nutHeight: 2 },
  { d: 3, pitch: 0.5, acrossFlats: 5.5, headHeight: 2, nutHeight: 2.4 },
  { d: 4, pitch: 0.7, acrossFlats: 7, headHeight: 2.8, nutHeight: 3.2 },
  { d: 5, pitch: 0.8, acrossFlats: 8, headHeight: 3.5, nutHeight: 4.7 },
  { d: 6, pitch: 1, acrossFlats: 10, headHeight: 4, nutHeight: 5.2 },
  { d: 8, pitch: 1.25, acrossFlats: 13, headHeight: 5.3, nutHeight: 6.8 },
  { d: 10, pitch: 1.5, acrossFlats: 16, headHeight: 6.4, nutHeight: 8.4 },
  { d: 12, pitch: 1.75, acrossFlats: 18, headHeight: 7.5, nutHeight: 10.8 },
  { d: 14, pitch: 2, acrossFlats: 21, headHeight: 8.8, nutHeight: 12.8 },
  { d: 16, pitch: 2, acrossFlats: 24, headHeight: 10, nutHeight: 14.8 },
  { d: 20, pitch: 2.5, acrossFlats: 30, headHeight: 12.5, nutHeight: 18 },
  { d: 24, pitch: 3, acrossFlats: 36, headHeight: 15, nutHeight: 21.5 },
]

export function metricSize(d: number): MetricSize {
  const size = METRIC_SIZES.find((s) => s.d === d)
  if (!size) throw new Error(`M${d} is not a supported metric size`)
  return size
}
