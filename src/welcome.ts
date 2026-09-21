const STORAGE_KEY = 'flowcad.welcomed'

interface Step {
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    title: 'Welcome to FlowCAD',
    body: 'A parametric 3D CAD tool that runs entirely in this browser tab. Nothing uploads. Nothing needs an account. Every project autosaves to this device.',
  },
  {
    title: 'Add a shape',
    body: 'Pick one from the palette on the left. Every shape is parametric: change its size, colour, or material in the properties panel on the right and the model rebuilds instantly.',
  },
  {
    title: 'Combine shapes',
    body: 'Select two or more objects, then Union / Subtract / Intersect them from the toolbar. Fillet and chamfer round or bevel edges. The history is non-destructive: change an input and the whole tree rebuilds.',
  },
  {
    title: 'Move things around',
    body: 'Click an object to select. W / E / R switch move / rotate / scale gizmos. Arrow keys nudge by snap. Ctrl+D duplicates. Ctrl+A selects all. Hold Shift to add to selection. Press ? any time to see every shortcut.',
  },
  {
    title: 'Export',
    body: 'Save the project as .flowcad (full state), or export STL / OBJ / 3MF / GLB / PLY for 3D printing, a 4-view SVG blueprint, a CSV bill of materials, or a standalone HTML viewer to share.',
  },
]

/** Shows a one-time onboarding modal on first visit. Skippable, and Escape closes it. */
export function buildWelcome() {
  if (localStorage.getItem(STORAGE_KEY) === 'yes') return

  const overlay = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'welcome-overlay' }))
  const panel = overlay.appendChild(Object.assign(document.createElement('div'), { className: 'welcome-panel' }))
  const title = panel.appendChild(document.createElement('h2'))
  const body = panel.appendChild(document.createElement('p'))
  const dots = panel.appendChild(Object.assign(document.createElement('div'), { className: 'welcome-dots' }))
  const nav = panel.appendChild(Object.assign(document.createElement('div'), { className: 'welcome-nav' }))
  const skip = nav.appendChild(Object.assign(document.createElement('button'), { textContent: 'Skip' }))
  const next = nav.appendChild(Object.assign(document.createElement('button'), { textContent: 'Next' }))
  next.classList.add('primary')

  let index = 0
  const render = () => {
    const step = STEPS[index]
    title.textContent = step.title
    body.textContent = step.body
    dots.replaceChildren(
      ...STEPS.map((_, i) => Object.assign(document.createElement('span'), { className: i === index ? 'dot active' : 'dot' })),
    )
    next.textContent = index === STEPS.length - 1 ? 'Get started' : 'Next'
  }

  const close = () => {
    localStorage.setItem(STORAGE_KEY, 'yes')
    overlay.remove()
    document.removeEventListener('keydown', onKey, true)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); close() }
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.stopPropagation(); advance() }
    if (e.key === 'ArrowLeft' && index > 0) { e.stopPropagation(); index--; render() }
  }
  const advance = () => {
    if (index < STEPS.length - 1) { index++; render() } else close()
  }
  skip.addEventListener('click', close)
  next.addEventListener('click', advance)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
  document.addEventListener('keydown', onKey, true)
  render()
}
