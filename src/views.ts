import type { Viewport } from './viewport'

interface SavedView {
  name: string
  position: [number, number, number]
  target: [number, number, number]
}

const STORAGE_KEY = 'flowcad.views'
const MAX_VIEWS = 20

function load(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedView[]) : []
  } catch {
    return []
  }
}

function save(views: SavedView[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views))
  } catch {
    // Ignore quota errors; camera bookmarks are best-effort.
  }
}

/**
 * Toolbar dropdown of camera bookmarks: pick to recall, click Save to add the current view.
 * Persisted in localStorage so bookmarks survive reloads.
 */
export function buildNamedViews(toolbar: HTMLElement, view: Viewport, status: HTMLElement) {
  let views = load()

  const group = toolbar.appendChild(Object.assign(document.createElement('div'), { className: 'group' }))
  const select = group.appendChild(document.createElement('select'))
  select.title = 'Recall a saved camera view'
  const saveBtn = group.appendChild(Object.assign(document.createElement('button'), { textContent: 'Save view' }))
  const deleteBtn = group.appendChild(Object.assign(document.createElement('button'), { textContent: '×' }))
  deleteBtn.title = 'Delete the currently selected view'

  const rebuild = () => {
    select.replaceChildren()
    select.add(new Option(views.length === 0 ? '(no saved views)' : 'Recall...', ''))
    for (const v of views) select.add(new Option(v.name, v.name))
    deleteBtn.disabled = views.length === 0
  }
  rebuild()

  select.addEventListener('change', () => {
    const chosen = views.find((v) => v.name === select.value)
    if (!chosen) return
    view.camera.position.set(...chosen.position)
    view.controls.target.set(...chosen.target)
    view.controls.update()
    status.textContent = `Recalled view "${chosen.name}"`
    select.value = ''
  })

  saveBtn.addEventListener('click', () => {
    const name = prompt('Name this view:')?.trim()
    if (!name) return
    views = views.filter((v) => v.name !== name)
    views.push({
      name,
      position: [view.camera.position.x, view.camera.position.y, view.camera.position.z],
      target: [view.controls.target.x, view.controls.target.y, view.controls.target.z],
    })
    if (views.length > MAX_VIEWS) views = views.slice(-MAX_VIEWS)
    save(views)
    rebuild()
    status.textContent = `Saved view "${name}"`
  })

  deleteBtn.addEventListener('click', () => {
    if (views.length === 0) return
    const last = views[views.length - 1]
    views.pop()
    save(views)
    rebuild()
    status.textContent = `Deleted view "${last.name}"`
  })
}
