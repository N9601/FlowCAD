import type { Viewport } from './viewport'

const FRAMES_PER_SECOND = 30
const TURN_DEGREES_PER_SECOND = 30
const FULL_ROTATION_SECONDS = 360 / TURN_DEGREES_PER_SECOND

/**
 * Records a full-turn WebM by streaming the canvas through MediaRecorder while the viewport's
 * turntable spins. Downloads the resulting file when the rotation completes.
 */
export function recordTurntable(view: Viewport, status: HTMLElement): Promise<void> {
  const canvas = view.renderer.domElement
  const captureStream = canvas.captureStream as ((fps: number) => MediaStream) | undefined
  if (!captureStream) {
    status.textContent = 'This browser cannot record the canvas.'
    return Promise.resolve()
  }
  const stream = captureStream.call(canvas, FRAMES_PER_SECOND)

  // Pick the best WebM codec the browser supports; VP9 first, then VP8 as a fallback.
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
  )
  if (!mimeType) {
    status.textContent = 'This browser cannot record WebM video.'
    return Promise.resolve()
  }

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
  const wasSpinning = view.isTurntableRunning()
  view.setTurntable(TURN_DEGREES_PER_SECOND)

  return new Promise((resolve) => {
    recorder.onstop = () => {
      view.setTurntable(wasSpinning ? TURN_DEGREES_PER_SECOND : 0)
      const blob = new Blob(chunks, { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: 'flowcad-turntable.webm' })
      a.click()
      URL.revokeObjectURL(url)
      status.textContent = `Turntable saved (${(blob.size / 1024).toFixed(0)} KB)`
      resolve()
    }
    recorder.start()
    status.textContent = `Recording turntable for ${FULL_ROTATION_SECONDS.toFixed(0)} s...`
    setTimeout(() => recorder.stop(), FULL_ROTATION_SECONDS * 1000)
  })
}
