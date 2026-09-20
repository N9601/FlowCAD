import type { CadDocument } from '../document'
import { encodeGlb } from './gltf'
import type { NamedPart } from './mesh-formats'

const VIEWER_URL = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.0.0/dist/model-viewer.min.js'

const escapeHtml = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary)
}

/**
 * Emits a standalone HTML file that shows the current scene in any modern browser via Google's
 * <model-viewer> web component (loaded from a CDN). The GLB itself is inlined as a base64 data URL,
 * so the recipient just needs to open the file — no extra downloads for the geometry.
 */
export function encodeStandaloneHtml(doc: CadDocument, title = 'FlowCAD Model'): ArrayBuffer {
  const parts: NamedPart[] = doc.objects
    .filter((o) => o.visible)
    .map((o) => {
      o.mesh.updateMatrixWorld()
      return { name: o.name, solid: o.solid, matrix: o.mesh.matrixWorld.toArray() }
    })
  const glbBytes = encodeGlb(parts)
  const dataUrl = `data:model/gltf-binary;base64,${base64(glbBytes)}`

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script type="module" src="${VIEWER_URL}"></script>
    <style>
      html, body { margin: 0; height: 100%; background: #1b1e23; color: #d7dce3; font-family: system-ui, sans-serif; }
      header { padding: 12px 18px; border-bottom: 1px solid #343a44; display: flex; align-items: baseline; gap: 16px; }
      header h1 { margin: 0; font-size: 18px; letter-spacing: 0.02em; }
      header small { color: #8a93a0; }
      model-viewer { display: block; width: 100%; height: calc(100vh - 60px); background: #1b1e23; --poster-color: transparent; }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <small>${parts.length} object${parts.length === 1 ? '' : 's'} · exported by FlowCAD</small>
    </header>
    <model-viewer
      src="${dataUrl}"
      alt="${escapeHtml(title)}"
      camera-controls
      touch-action="pan-y"
      shadow-intensity="1"
      exposure="1.1"
      environment-image="neutral"
    ></model-viewer>
  </body>
</html>
`
  return new TextEncoder().encode(html).buffer as ArrayBuffer
}
