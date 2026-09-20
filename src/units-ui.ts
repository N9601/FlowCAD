import type { CadDocument } from './document'
import { getUnits, onUnitsChanged, setUnits } from './units'

/**
 * Toolbar toggle that switches display units between millimetres and inches. Fires an event that
 * downstream panels listen to so their strings update immediately.
 */
export function buildUnitsToggle(toolbar: HTMLElement, doc: CadDocument) {
  const button = toolbar
    .appendChild(Object.assign(document.createElement('div'), { className: 'group' }))
    .appendChild(document.createElement('button'))
  button.title = 'Toggle between millimetres and inches'
  const refreshLabel = () => (button.textContent = getUnits() === 'in' ? 'inch' : 'mm')
  refreshLabel()
  button.addEventListener('click', () => {
    setUnits(getUnits() === 'in' ? 'mm' : 'in')
    refreshLabel()
    // Re-render selection-dependent panels that show lengths.
    doc.dispatchEvent(new Event('change'))
  })
  onUnitsChanged(refreshLabel)
}
