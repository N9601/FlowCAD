import './style.css'
import { CadDocument } from './document'
import { buildToolbar } from './toolbar'
import { Viewport } from './viewport'

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!

const view = new Viewport($('#viewport'))
const doc = new CadDocument(view)
buildToolbar($('#toolbar'), $('#statusbar'), doc)
