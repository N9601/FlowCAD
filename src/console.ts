import type { CadDocument } from './document'
import { runScript, SHOWCASE_ARCH_SCRIPT, SHOWCASE_SCRIPT, STARTER_SCRIPT } from './script'
import type { Viewport } from './viewport'

const STORAGE_KEY = 'flowcad.script'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props)
}

export function buildConsole(toolbar: HTMLElement, host: HTMLElement, doc: CadDocument, view: Viewport) {
  const drawer = host.appendChild(el('section', { id: 'console', hidden: true }))
  const header = drawer.appendChild(el('header'))
  header.appendChild(el('strong', { textContent: 'Script' }))
  const run = header.appendChild(el('button', { textContent: 'Run (Ctrl+Enter)' }))
  const reset = header.appendChild(el('button', { textContent: 'Load example' }))
  const showcase = header.appendChild(el('button', { textContent: 'Load planetary' }))
  const arch = header.appendChild(el('button', { textContent: 'Load architecture' }))
  const close = header.appendChild(el('button', { textContent: 'Close' }))

  const editor = drawer.appendChild(el('textarea', { spellcheck: false }))
  editor.value = localStorage.getItem(STORAGE_KEY) ?? STARTER_SCRIPT
  const output = drawer.appendChild(el('pre'))

  const toggle = toolbar
    .appendChild(el('div', { className: 'group' }))
    .appendChild(el('button', { textContent: 'Script' }))
  const setOpen = (open: boolean) => {
    drawer.hidden = !open
    if (open) editor.focus()
  }
  toggle.addEventListener('click', () => setOpen(Boolean(drawer.hidden)))
  close.addEventListener('click', () => setOpen(false))
  reset.addEventListener('click', () => (editor.value = STARTER_SCRIPT))
  showcase.addEventListener('click', () => (editor.value = SHOWCASE_SCRIPT))
  arch.addEventListener('click', () => (editor.value = SHOWCASE_ARCH_SCRIPT))

  const execute = async () => {
    localStorage.setItem(STORAGE_KEY, editor.value)
    run.disabled = true
    output.className = ''
    output.textContent = ''
    const started = performance.now()
    try {
      await runScript(editor.value, doc, view, (line) => (output.textContent += `${line}\n`))
      output.textContent += `Done in ${(performance.now() - started).toFixed(0)} ms, ${doc.objects.length} object(s) in scene.`
    } catch (err) {
      output.className = 'error'
      output.textContent += `Error: ${err instanceof Error ? err.message : err}`
    } finally {
      run.disabled = false
    }
  }
  run.addEventListener('click', execute)

  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      execute()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end')
    }
  })
}
