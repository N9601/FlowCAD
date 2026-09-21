export type ToastLevel = 'info' | 'success' | 'warn' | 'error'

const DEFAULT_MS = 3200
const ERROR_MS = 5500

let host: HTMLDivElement | undefined

function ensureHost(): HTMLDivElement {
  if (host) return host
  host = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toasts' }))
  return host
}

/**
 * Shows a transient message near the top of the viewport. Errors stick around longer and are
 * click-to-dismiss; other levels auto-fade. Multiple toasts stack.
 */
export function toast(text: string, level: ToastLevel = 'info') {
  const el = document.createElement('div')
  el.className = `toast toast-${level}`
  el.textContent = text
  el.addEventListener('click', () => dismiss(el))
  ensureHost().appendChild(el)
  requestAnimationFrame(() => el.classList.add('show'))
  const timeout = level === 'error' ? ERROR_MS : DEFAULT_MS
  setTimeout(() => dismiss(el), timeout)
}

function dismiss(el: HTMLElement) {
  if (!el.isConnected) return
  el.classList.remove('show')
  setTimeout(() => el.remove(), 250)
}
