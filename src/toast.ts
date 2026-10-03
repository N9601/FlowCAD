export type ToastLevel = 'info' | 'success' | 'warn' | 'error'

const DEFAULT_MS = 3200
const ERROR_MS = 5500

let host: HTMLDivElement | undefined

function ensureHost(): HTMLDivElement {
  if (host) return host
  host = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toasts' }))
  // A live region, so screen readers announce each message as it appears.
  host.setAttribute('role', 'status')
  return host
}

/**
 * Shows a transient message near the top of the viewport. Errors stick around longer and are
 * click-to-dismiss; other levels auto-fade. Multiple toasts stack.
 */
export function toast(text: string, level: ToastLevel = 'info') {
  const el = document.createElement('div')
  el.className = `toast toast-${level}`
  if (level === 'error') el.setAttribute('role', 'alert')
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
