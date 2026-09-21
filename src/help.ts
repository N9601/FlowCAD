const SHORTCUTS: [string, string][] = [
  ['?', 'Show or hide this help'],
  ['Ctrl+K', 'Open the command palette'],
  ['W / E / R', 'Move / Rotate / Scale gizmo'],
  ['1 / 2 / 3 / 4', 'Front / Right / Top / Iso view'],
  ['F', 'Fit selection (or everything) in view'],
  ['X', 'X-ray transparency mode'],
  ['C', 'Toggle live cross-section'],
  ['M', 'Toggle measure tool'],
  ['B', 'Drop selection to the bed'],
  ['Ctrl+A', 'Select all objects'],
  ['Ctrl+D', 'Duplicate selection'],
  ['Ctrl+C / Ctrl+V', 'Copy / paste selection to the system clipboard'],
  ['Del / Backspace', 'Delete selection'],
  ['Arrows / PgUp / PgDn', 'Nudge selection by snap in X / Y / Z (Shift = 10x)'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'],
  ['Esc', 'Clear selection or exit a tool'],
  ['Click', 'Select an object (whole group if grouped)'],
  ['Shift+click', 'Add or remove from selection'],
  ['Alt+click', 'Select just the clicked object, not its group'],
  ['Shift+drag', 'Box-select in the viewport'],
  ['Right-click', 'Context menu with common actions'],
  ['Ctrl+Enter', 'Run the script (when the console is open)'],
]

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** Adds a Help button to the toolbar and a keyboard-shortcut overlay toggled by ? or Help. */
export function buildHelp(toolbar: HTMLElement) {
  const overlay = document.body.appendChild(el('div', 'help-overlay'))
  overlay.hidden = true
  const panel = overlay.appendChild(el('div', 'help-panel'))
  const x = panel.appendChild(el('button', 'overlay-close', '×'))
  x.title = 'Close (Esc)'
  x.addEventListener('click', () => (overlay.hidden = true))
  panel.appendChild(el('h2', undefined, 'FlowCAD shortcuts'))
  const table = panel.appendChild(el('table'))
  for (const [key, description] of SHORTCUTS) {
    const row = table.appendChild(document.createElement('tr'))
    row.appendChild(el('th', undefined, key))
    row.appendChild(el('td', undefined, description))
  }
  const close = panel.appendChild(el('button', undefined, 'Close (?)'))

  const setOpen = (open: boolean) => {
    overlay.hidden = !open
  }
  overlay.addEventListener('click', (e) => {
    // Clicking the dim backdrop closes; clicking inside the panel is left alone.
    if (e.target === overlay) setOpen(false)
  })
  close.addEventListener('click', () => setOpen(false))

  const toggle = toolbar.appendChild(el('div', 'group')).appendChild(el('button', undefined, 'Help (?)'))
  const openHelp = () => {
    // Close any other overlay first so only one modal is visible at a time.
    for (const other of document.querySelectorAll('.palette-overlay:not([hidden])')) (other as HTMLElement).hidden = true
    setOpen(Boolean(overlay.hidden))
  }
  toggle.addEventListener('click', openHelp)

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && !overlay.hidden) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        return
      }
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        openHelp()
      }
    },
    true,
  )
}
