import * as THREE from 'three'
import { readPref, writePref } from './prefs'
import type { Viewport } from './viewport'

type Theme = 'dark' | 'light'
const STORAGE_KEY = 'flowcad.theme'

const BACKGROUNDS: Record<Theme, number> = { dark: 0x1b1e23, light: 0xf1f2f4 }

function applyTheme(theme: Theme, view: Viewport) {
  document.documentElement.classList.toggle('theme-light', theme === 'light')
  ;(view.scene.background as THREE.Color).setHex(BACKGROUNDS[theme])
}

/** Toolbar button that toggles a light theme; the choice persists in localStorage. */
export function buildTheme(toolbar: HTMLElement, view: Viewport) {
  let theme: Theme = readPref(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  applyTheme(theme, view)

  const button = toolbar
    .appendChild(Object.assign(document.createElement('div'), { className: 'group' }))
    .appendChild(Object.assign(document.createElement('button'), { textContent: theme === 'light' ? 'Dark' : 'Light' }))
  button.title = 'Toggle light theme'
  button.addEventListener('click', () => {
    theme = theme === 'light' ? 'dark' : 'light'
    applyTheme(theme, view)
    button.textContent = theme === 'light' ? 'Dark' : 'Light'
    writePref(STORAGE_KEY, theme)
  })
}
