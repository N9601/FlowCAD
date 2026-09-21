import './style.css'
import { buildConsole } from './console'
import { CadDocument, type SavedDocument } from './document'
import { buildMeasure } from './measure'
import { buildPalette } from './palette'
import { buildPanel } from './panel'
import { buildContextMenu } from './contextmenu'
import { buildCommandPalette } from './command-palette'
import { buildDrawTools } from './draw'
import { buildExplodeSlider } from './explode'
import { buildAnnotations } from './annotations'
import { buildClipboard } from './clipboard'
import { buildNamedViews } from './views'
import { buildNavCube } from './navcube'
import { buildHelp } from './help'
import { buildPrintCheck } from './printpanel'
import { buildStats } from './stats'
import { buildSectionView } from './section'
import { buildSectionClip } from './section-plane'
import { buildHistoryPanel } from './history-panel'
import { buildAlignmentGuides } from './guides'
import { buildLayerPreview } from './layers'
import { autosave, snapshots } from './storage'
import { buildTheme } from './theme'
import { buildUnitsToggle } from './units-ui'
import { buildToolbar } from './toolbar'
import { buildToolsPanel } from './toolspanel'
import { Viewport } from './viewport'

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!

const view = new Viewport($('#scene'))
const doc = new CadDocument(view)
// Exposed for the browser console: `flowcad.doc.serialize()` and similar.
;(window as unknown as { flowcad: { doc: CadDocument; view: Viewport } }).flowcad = { doc, view }
buildTheme($('#toolbar'), view)
buildUnitsToggle($('#toolbar'), doc)
buildToolbar($('#toolbar'), $('#statusbar'), doc, view)
buildConsole($('#toolbar'), $('#viewport'), doc, view)
buildMeasure($('#toolbar'), view, doc, $('#statusbar'))
buildPalette($('#palette'), $('#statusbar'), doc)
buildPanel($('#panel'), $('#statusbar'), doc)
buildToolsPanel($('#panel').appendChild(document.createElement('section')), $('#statusbar'), doc)
buildPrintCheck($('#toolbar'), $('#panel'), $('#statusbar'), doc)
buildSectionView($('#toolbar'), view, doc, $('#statusbar'))
buildSectionClip($('#toolbar'), view, doc, $('#statusbar'))
buildContextMenu($('#scene'), doc, $('#statusbar'))
buildStats($('#scene'), doc)
buildHelp($('#toolbar'))
buildCommandPalette(doc, view, $('#statusbar'))
buildDrawTools($('#toolbar'), view, doc, $('#statusbar'))
buildNavCube($('#scene'), view, doc)
buildExplodeSlider($('#toolbar'), doc, $('#statusbar'))
buildNamedViews($('#toolbar'), view, $('#statusbar'))
buildAnnotations($('#scene'), $('#toolbar'), view, doc, $('#statusbar'))
buildClipboard(doc, $('#statusbar'))

const saved = await autosave.load<SavedDocument>().catch(() => undefined)
if (saved?.length) doc.load(saved)
doc.addEventListener('saved-state', () => {
  const data = doc.serialize()
  autosave.save(data).catch((err) => console.warn('Autosave failed', err))
  snapshots.record(data).catch((err) => console.warn('Snapshot failed', err))
})
buildHistoryPanel($('#toolbar'), doc, $('#statusbar'))
buildLayerPreview($('#toolbar'), doc, $('#statusbar'))
buildAlignmentGuides(view, doc)
