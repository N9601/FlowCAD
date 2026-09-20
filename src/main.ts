import './style.css'
import { CadDocument, type SavedDocument } from './document'
import { buildPalette } from './palette'
import { buildPanel } from './panel'
import { autosave } from './storage'
import { buildToolbar } from './toolbar'
import { Viewport } from './viewport'

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!

const view = new Viewport($('#viewport'))
const doc = new CadDocument(view)
buildToolbar($('#toolbar'), $('#statusbar'), doc)
buildPalette($('#palette'), $('#statusbar'), doc)
buildPanel($('#panel'), $('#statusbar'), doc)

const saved = await autosave.load<SavedDocument>().catch(() => undefined)
if (saved?.length) doc.load(saved)
doc.addEventListener('saved-state', () => {
  autosave.save(doc.serialize()).catch((err) => console.warn('Autosave failed', err))
})
