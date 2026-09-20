# FlowCAD

Browser-based parametric 3D CAD modeler. Everything runs client-side: no server, no account, no upload.

FlowCAD reads and writes STL, OBJ, 3MF, GLB, PLY, SVG, DXF and its own JSON `.flowcad` project file, all
from one tab. It builds solids with the Manifold kernel in a Web Worker, so every union, fillet and
extrude is watertight and the UI never blocks.

## Features

### Modeling

- 25+ parametric primitives across three categories:
  - **Basic:** cube, cylinder, sphere, cone, tube, torus
  - **More solids:** prism, pyramid, wedge, rounded box, dome, capsule, revolve, extrude (with twist and
    taper), ArcSphere (partial sphere), text (bundled Roboto Bold), pipe (polyline sweep), spring (helix)
  - **Mechanical:** bolt, nut, threaded rod (M2 to M24, ISO 68-1 60-degree thread), pulley (V-belt),
    involute spur gear
- Boolean **union / subtract / intersect** on any number of objects; subtract removes every later input
  from the first
- **Fillet** and **chamfer** on any object via Manifold's Minkowski erode-and-dilate; every convex edge
  and vertex is rounded (fillet) or cut back at 45 degrees (chamfer)
- **Non-destructive history:** every boolean, fillet or chamfer keeps its input tree, so you can change
  a hole's size, position or engraved text after the cut, or **Ungroup into parts** back to originals
- Live **cross-section view:** drag a plane along X, Y or Z; clipped materials switch to double-sided
  so the interior back-faces show through
- Section cut at any Z height, exported as 1:1 mm SVG or DXF for laser cutters and CNC

### Editing

- Click to select, shift-click to add, shift-drag to box-select
- Move / rotate / scale gizmo with configurable snap (0.1 / 0.5 / 1 / 5 / 10 mm)
- Numeric position, rotation and scale entry in the properties panel
- Live size, volume, surface area and triangle count on the selected object
- Per-object color picker; visibility toggle in the object list
- Layout tools: drop-to-bed, mirror on any axis, align to a target, linear or circular arrays
- Measure tool: click two points on any model for distance and its X/Y/Z components (corner snapping)
- Undo / redo, 200 levels

### Import / export

- **Import:** .flowcad projects, STL (binary or ASCII), OBJ, GLB, PLY (file picker or drag-and-drop);
  imports are welded and checked watertight so they work in booleans
- **Export mesh:** STL, OBJ, 3MF, GLB, PLY of the selection, or of everything when nothing is selected
- **Export section:** 1:1 mm SVG or DXF at any Z height
- **Save project:** everything (positions, colors, boolean history) as a `.flowcad` JSON file
- Scene autosaves to IndexedDB and is restored on reload

### Scripting

The **Script** button in the toolbar opens a console drawer. Every shape is an async function that
takes its dimensions in mm (anything omitted uses the default) and returns a part:

```js
clear()
const plate = await roundedBox({ x: 100, y: 40, z: 6, radius: 2 })
const hole = (await cylinder({ radius: 3.3, height: 20 })).at(-36, 0, 3)
const bracket = await subtract(plate, hole)
bracket.name('Bracket').color('#c0864a')
fit()
```

Parts chain `.at(x, y, z)`, `.move(dx, dy, dz)`, `.rotate(x, y, z)`, `.scale(f)`, `.mirror('x')`,
`.drop()`, `.clone()`, `.color('#c0864a')` and `.name('...')`. Async: `await part.fillet(2)` and
`await part.chamfer(1)`. Booleans take any number of parts. One script run is one undo step.

Three loadable showcases: **Load planetary** (gear plinth), **Load architecture** (a metropolis with a
skyscraper, temple, rotunda, fountain and windmill) and **Load mechanical** (bracket assembly with
gears, spring, hydraulic pipe and pulley).

### Print check (FDM 3D printing)

Toolbar **Print check** analyses the selection for FDM printing:
- overhangs steeper than the configured angle
- walls thinner than the nozzle can print reliably
- poor bed contact
- parts floating above or dipping below the bed
- parts too big for the build volume

Problem faces are coloured on the model (red = support, amber = thin wall) and total PLA weight is
estimated. **Fix issues automatically** reorients each part to its flattest side, scales down to fit
the build volume, and drops to the bed in one click.

## Shortcuts

| Key | Action |
| --- | --- |
| W / E / R | Move / rotate / scale |
| X | X-ray mode |
| C | Toggle live cross-section |
| M | Toggle the measure tool |
| B | Drop the selection to the bed |
| F | Fit selection (or everything) in view |
| 1 / 2 / 3 / 4 | Front / right / top / iso view |
| Ctrl+D | Duplicate selection |
| Delete | Delete selection |
| Ctrl+Z, Ctrl+Y | Undo, redo |
| Esc | Clear selection |

## Development

```bash
npm install
npm run dev
```

```bash
npm run build
```

## Architecture

| Path | Role |
| --- | --- |
| `src/viewport.ts` | Scene, camera, renderer, orbit controls, framing |
| `src/document.ts` | Scene objects, selection, gizmo, undo history, colors, visibility |
| `src/csg/` | Manifold WASM worker, typed request protocol, promise client |
| `src/csg/gear.ts`, `csg/thread.ts`, `csg/iso.ts` | Gear profile, thread and fastener generators, ISO size table |
| `src/csg/shapes.ts`, `csg/text.ts`, `csg/profile.ts`, `csg/pipe.ts` | Extra solids, font outlines, profile and path parsing |
| `src/actions.ts` | Shared add / combine / fillet / chamfer actions |
| `src/catalog.ts` | Shape defaults and dimension validation |
| `src/palette.ts` | Categorized left shape palette |
| `src/panel.ts` | Object list and properties editor |
| `src/toolbar.ts` | Toolbar and keyboard bindings |
| `src/toolspanel.ts`, `src/arrange.ts` | Layout tools (drop, mirror, align, arrays) |
| `src/measure.ts` | Measure tool with corner snapping |
| `src/section.ts` | Live cross-section clipping |
| `src/printcheck.ts`, `src/printfix.ts`, `src/printpanel.ts` | Print check, auto-fix and its panel |
| `src/console.ts`, `src/script.ts` | Script API and console drawer, with bundled showcase scenes |
| `src/io/` | STL, OBJ, GLB, PLY import/export, 3MF export, SVG/DXF sections, .flowcad projects, ZIP writer, winding fix |
| `src/storage.ts` | IndexedDB autosave |

Every object keeps its indexed watertight mesh (`SolidData`) alongside the display mesh. Booleans and
export read the watertight data; the display mesh only adds creased normals for shading. Boolean results
also keep a `CsgNode` tree (primitive specs, imported meshes, and operations with their transforms),
which the worker re-evaluates whenever a part is edited.

## Built with

- [three.js](https://threejs.org/) (MIT)
- [Manifold](https://github.com/elalish/manifold) (Apache 2.0)
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) (MIT)
- [opentype.js](https://github.com/opentypejs/opentype.js) (MIT)
- [Roboto](https://fontsource.org/fonts/roboto) (OFL 1.1)
