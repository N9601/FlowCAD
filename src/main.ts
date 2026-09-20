import './style.css'
import { buildConsole } from './console'
import { CadDocument, type SavedDocument } from './document'
import { buildMeasure } from './measure'
import { buildPalette } from './palette'
import { buildPanel } from './panel'
import { buildContextMenu } from './contextmenu'
import { buildHelp } from './help'
import { buildPrintCheck } from './printpanel'
import { buildStats } from './stats'
import { buildSectionView } from './section'
import { autosave } from './storage'
import { buildToolbar } from './toolbar'
import { buildToolsPanel } from './toolspanel'
import { Viewport } from './viewport'

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!

const view = new Viewport($('#scene'))
const doc = new CadDocument(view)
// Exposed for the browser console: `flowcad.doc.serialize()` and similar.
;(window as unknown as { flowcad: { doc: CadDocument; view: Viewport } }).flowcad = { doc, view }
buildToolbar($('#toolbar'), $('#statusbar'), doc, view)
buildConsole($('#toolbar'), $('#viewport'), doc, view)
buildMeasure($('#toolbar'), view, doc, $('#statusbar'))
buildPalette($('#palette'), $('#statusbar'), doc)
buildPanel($('#panel'), $('#statusbar'), doc)
buildToolsPanel($('#panel').appendChild(document.createElement('section')), $('#statusbar'), doc)
buildPrintCheck($('#toolbar'), $('#panel'), $('#statusbar'), doc)
buildSectionView($('#toolbar'), view, doc, $('#statusbar'))
buildContextMenu($('#scene'), doc, $('#statusbar'))
buildStats($('#scene'), doc)
buildHelp($('#toolbar'))

const saved = await autosave.load<SavedDocument>().catch(() => undefined)
if (saved?.length) doc.load(saved)
doc.addEventListener('saved-state', () => {
  autosave.save(doc.serialize()).catch((err) => console.warn('Autosave failed', err))
})
