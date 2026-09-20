import type { CadDocument, SavedDocument } from './document'
import { snapshots } from './storage'

function timeAgo(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/**
 * Toolbar dropdown that lists snapshots taken by the autosave system (up to 10, one per minute).
 * Pick one to restore the whole scene to how it looked then.
 */
export function buildHistoryPanel(toolbar: HTMLElement, doc: CadDocument, status: HTMLElement) {
  const group = toolbar.appendChild(Object.assign(document.createElement('div'), { className: 'group' }))
  const select = group.appendChild(document.createElement('select'))
  select.title = 'Restore a rolling autosave snapshot'

  const refresh = async () => {
    const list = await snapshots.list<SavedDocument>()
    select.replaceChildren()
    select.add(new Option(list.length === 0 ? '(no snapshots yet)' : `${list.length} snapshot${list.length > 1 ? 's' : ''}...`, ''))
    for (const { id, createdAt, data } of list) {
      select.add(new Option(`${timeAgo(Date.now() - createdAt)} · ${data.length} obj`, id))
    }
  }
  refresh()

  select.addEventListener('change', async () => {
    if (!select.value) return
    const list = await snapshots.list<SavedDocument>()
    const chosen = list.find((s) => s.id === select.value)
    if (!chosen) return
    doc.load(chosen.data)
    doc.commit()
    status.textContent = `Restored snapshot from ${timeAgo(Date.now() - chosen.createdAt)}`
    select.value = ''
    refresh()
  })

  doc.addEventListener('saved-state', refresh)
}
