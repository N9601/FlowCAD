import { buildCommandRegistry, type Command } from './palette-commands'
import type { CadDocument } from './document'
import type { Viewport } from './viewport'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

/** Fuzzy substring rank: every term must appear in order; earlier position and shorter gaps score higher. */
function fuzzy(query: string, haystack: string): number {
  let cursor = 0
  let score = 0
  for (const ch of query) {
    const at = haystack.indexOf(ch, cursor)
    if (at < 0) return -1
    score += at - cursor === 0 ? 3 : 1
    cursor = at + 1
  }
  return score - haystack.length / 200
}

export function buildCommandPalette(doc: CadDocument, view: Viewport, status: HTMLElement) {
  const commands = buildCommandRegistry(doc, view, status)
  const overlay = document.body.appendChild(el('div', 'palette-overlay'))
  overlay.hidden = true
  const panel = overlay.appendChild(el('div', 'palette-panel'))
  const input = panel.appendChild(el('input'))
  input.placeholder = 'Type a command...'
  input.type = 'text'
  const results = panel.appendChild(el('ul', 'palette-results'))

  let filtered: Command[] = []
  let cursor = 0

  const render = () => {
    results.replaceChildren()
    filtered.forEach((cmd, i) => {
      const li = results.appendChild(el('li', i === cursor ? 'active' : undefined))
      li.textContent = cmd.label
      li.addEventListener('mousedown', (e) => {
        e.preventDefault()
        run(cmd)
      })
    })
  }

  const refresh = () => {
    const query = input.value.trim().toLowerCase()
    if (query === '') filtered = commands.slice(0, 60)
    else {
      const scored = commands.map((c) => ({ c, s: fuzzy(query, c.keywords) })).filter((r) => r.s >= 0)
      scored.sort((a, b) => b.s - a.s)
      filtered = scored.slice(0, 40).map((r) => r.c)
    }
    cursor = 0
    render()
  }

  const run = async (cmd: Command) => {
    setOpen(false)
    try {
      await cmd.run()
    } catch (err) {
      status.textContent = `Error: ${err instanceof Error ? err.message : err}`
    }
  }

  const setOpen = (open: boolean) => {
    overlay.hidden = !open
    if (open) {
      input.value = ''
      refresh()
      input.focus()
    }
  }

  input.addEventListener('input', refresh)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      cursor = Math.min(filtered.length - 1, cursor + 1)
      render()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      cursor = Math.max(0, cursor - 1)
      render()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = filtered[cursor]
      if (cmd) run(cmd)
    } else if (e.key === 'Escape') setOpen(false)
  })
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) setOpen(false)
  })

  // Capture-phase listener so Escape closes the palette even if a nested widget consumed the event first.
  window.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        for (const other of document.querySelectorAll('.help-overlay:not([hidden])')) (other as HTMLElement).hidden = true
        setOpen(Boolean(overlay.hidden))
      } else if (e.key === 'Escape' && !overlay.hidden) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    },
    true,
  )
}
