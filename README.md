<div align="center">

# FlowCAD

![Version](https://img.shields.io/badge/Version-1.0.0-4da3ff?style=flat-square)
![Kernel](https://img.shields.io/badge/Kernel-Manifold%20WASM-1E2761?style=flat-square)
![Renderer](https://img.shields.io/badge/Renderer-three.js%20r186-000000?style=flat-square&logo=three.js&logoColor=white)
![Language](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Build](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-16a34a?style=flat-square)
![Status](https://img.shields.io/badge/Status-Stable-blueviolet?style=flat-square)

### **A parametric 3D CAD modeler in a single browser tab.**

Booleans, fillets, chamfers, print check, blueprint export, scripting. All client-side. No account. No upload. Manifold WASM in a Web Worker, three.js on the main thread.

<sub>Model. Verify. Ship.</sub>

[Quickstart](#quickstart) | [Features](#features) | [Scripting](#scripting) | [File Formats](#file-formats) | [Architecture](#architecture) | [Develop](#develop)

</div>

---

## Quickstart

**1. Clone and run:**

```bash
git clone https://github.com/N9601/FlowCAD.git
cd FlowCAD
npm install
npm run dev
```

Open `http://localhost:5183` in any modern browser. The app boots into a welcome tour on first visit; hit **?** any time for shortcuts or **Ctrl+K** for the command palette.

**2. First model in five lines:**

Open the **Script** drawer and paste:

```js
clear()
const plate  = await roundedBox({ x: 100, y: 40, z: 6, radius: 2 })
const hole   = (await cylinder({ radius: 3.3, height: 20 })).at(-36, 0, 3)
const bracket = (await subtract(plate, hole)).name('Bracket').material('Aluminum')
await bracket.fillet(1.5)
fit()
```

Hit **Ctrl+Enter**. Export as STL, GLB, or an SVG blueprint from the toolbar.

---

## Why

Fusion 360 and Onshape are cloud-locked and demand accounts. FreeCAD is desktop-native and heavy. Tinkercad is browser-based but its geometry kernel does not handle real booleans reliably.

FlowCAD gives you a Manifold-backed watertight kernel in a Web Worker, a parametric non-destructive history, and a modern PBR renderer, all in one tab. Nothing installs. Nothing uploads. Every project autosaves to this device.

One tab. Your machine. Watertight geometry.

---

## Features

<table>
<tr>
<td width="50%" valign="top">

### Modeling
- **25+ parametric primitives** across three categories (basic, more solids, mechanical)
- **Booleans:** union, subtract, intersect on any number of parts
- **Fillet and chamfer** on any object via Manifold Minkowski
- **Non-destructive history:** every op keeps its input tree; change a hole's size or engraved text after the cut
- **Ungroup into parts** to recover originals from a boolean
- **Live section clip** and 3-axis cross-section
- **Threaded mechanicals:** bolts, nuts, rods (M2 to M24, ISO 68-1 60-degree thread), pulleys, involute spur gears

### Editing
- Move, rotate, scale gizmo with 0.1 to 10 mm snap
- **Arrow-key nudge** in X / Y, PageUp / PageDown for Z, Shift = 10x
- **Linear + polar arrays** and **9 align commands** (min / center / max on X / Y / Z)
- **Isolate selection** to focus on one part; **Ctrl+A** selects all
- **Groups** move as one; **Alt-click** to pick a member
- **Smart alignment guides** on drag
- **Measure tool** with corner snapping
- 200 levels of undo plus a rolling 10-slot **snapshot history**

</td>
<td width="50%" valign="top">

### Camera and view
- **Fit, Front, Right, Top, Iso** view presets (F, 1-4)
- **X-ray**, **spin** (20 deg/s turntable), **WebM turntable recording**
- Real-time **PBR** with baked room environment
- **Shadow-mapped key light** with a shadow-catching plane
- **GTAO ambient occlusion** post-pass
- **Selection outline** via OutlinePass
- **NavCube** compass overlay
- Named camera **views** save-and-restore

### Overlays
- **Framerate, triangle count, selection W x D x H** always on
- **Mouse coordinate readout:** XY on ground, XYZ on object
- **Toast notifications** for successes and errors
- **Dark / light theme** with matching scene background
- **mm / inch units toggle**

### Print check (FDM)
- **Overhangs, thin walls, bed contact, oversized parts** highlighted red / amber on the model
- Weight estimated using assigned **material density**
- **Fix issues automatically** reorients, scales down, and drops to the bed in one click

</td>
</tr>
</table>

**12 PBR material presets** (PLA, PETG, ABS, Nylon, Resin, Wood, Aluminum, Steel, Brass, Copper, Titanium, Glass) drive roughness, metalness, tint, opacity and density. Switching materials updates both the render and the print-check weight instantly.

---

## Scripting

Every shape is an async function that takes dimensions in mm and returns a `Part`:

```js
clear()

// A geared plinth
const plinth = await cylinder({ radius: 30, height: 10 })
const gear   = (await gear({ teeth: 24, module: 2, thickness: 6 })).at(0, 0, 10)
const plate  = await union(plinth, gear)
plate.material('Brass').color('#c0864a')

// A dozen countersunk holes in a polar array
const hole = (await cylinder({ radius: 2, height: 20 })).at(22, 0, 0)
const with_holes = plate
for (let i = 0; i < 12; i++) {
  const clone = hole.clone().rotate(0, 0, i * 30)
  await subtract(with_holes, clone)
}

fit()
```

Every `Part` chains:

| | |
|---|---|
| `.at(x, y, z)` `.move(dx, dy, dz)` | absolute or relative translation |
| `.rotate(x, y, z)` (degrees) | orientation |
| `.scale(f)` | uniform scale |
| `.mirror('x' \| 'y' \| 'z')` | reflect about a plane |
| `.drop()` | snap onto Z = 0 |
| `.clone()` | copy at current transform |
| `.color('#c0864a')` `.material('Steel')` | appearance |
| `.name('...')` | rename in the outliner |
| `await .fillet(r)` `await .chamfer(r)` | edge treatments |

Booleans (`union`, `subtract`, `intersect`) accept any number of parts. One script run is one undo step.

**Bundled showcases:** planetary gear plinth, city block, mechanical bracket assembly, NYC skyline.

---

## File Formats

<table>
<tr><th align="left">Direction</th><th align="left">Formats</th></tr>
<tr>
<td valign="top"><b>Import</b></td>
<td>
  <code>.flowcad</code> full project restore &nbsp;·&nbsp;
  <code>STL</code> (binary + ASCII) &nbsp;·&nbsp;
  <code>OBJ</code> &nbsp;·&nbsp;
  <code>GLB</code> &nbsp;·&nbsp;
  <code>PLY</code>
  <br><sub>File picker or drag-and-drop. Imports welded and checked watertight so they work in booleans.</sub>
</td>
</tr>
<tr>
<td valign="top"><b>Mesh export</b></td>
<td><code>STL</code> &nbsp;·&nbsp; <code>OBJ</code> &nbsp;·&nbsp; <code>3MF</code> &nbsp;·&nbsp; <code>GLB</code> &nbsp;·&nbsp; <code>PLY</code></td>
</tr>
<tr>
<td valign="top"><b>2D export</b></td>
<td><code>SVG</code> / <code>DXF</code> section at any Z &nbsp;·&nbsp; <code>SVG</code> 4-view blueprint (front / right / top / iso)</td>
</tr>
<tr>
<td valign="top"><b>Sharing</b></td>
<td><code>HTML</code> standalone viewer &nbsp;·&nbsp; <code>PNG</code> snapshot &nbsp;·&nbsp; <code>WebM</code> turntable video</td>
</tr>
<tr>
<td valign="top"><b>Data</b></td>
<td><code>CSV</code> bill of materials (name, material, color, size, volume, weight, group)</td>
</tr>
<tr>
<td valign="top"><b>Project</b></td>
<td><code>.flowcad</code> JSON with positions, colors, groups, materials, and boolean history</td>
</tr>
</table>

Scene autosaves to IndexedDB every commit and restores on reload.

---

## Architecture

```
                +----------------------------------------------+
                |  Browser tab (main thread)                    |
                |  three.js r186 + OrbitControls + EffectComposer |
                |  RoomEnvironment PBR, Shadows, GTAO, Outline  |
                +---------------+------------------------------+
                                |
                +---------------v------------------------------+
                |  CadDocument                                  |
                |  scene graph, selection, groups, gizmo        |
                |  200-level undo, arrays, align, isolate       |
                +---------------+------------------------------+
                                |
              +-----------------+-----------------+
              |                 |                 |
     +--------v------+ +--------v------+ +-------v---------+
     |   UI layer    | |   Overlays    | |   File I/O      |
     |  toolbar,     | |  stats, coord | |  STL/OBJ/GLB/   |
     |  panels,      | |  readout,     | |  PLY/3MF, .flow |
     |  Ctrl+K       | |  toasts       | |  blueprint SVG  |
     +---------------+ +---------------+ +--------+--------+
                                                  |
                    +-----------------------------v--------+
                    |  Manifold WASM (Web Worker)          |
                    |  primitives, booleans, fillet/chamfer|
                    |  loft, section, validate, watertight |
                    +--------------------------------------+
```

**Kernel isolation:** every union, fillet, chamfer, extrude and section runs in a Web Worker, so heavy CSG never blocks input, rendering or animation. Boolean results keep a `CsgNode` tree that the worker re-evaluates when a part is edited.

**Watertight guarantee:** each object stores an indexed `SolidData` mesh alongside the display mesh. Booleans and exports read `SolidData`; the display mesh only adds creased normals for shading.

---

## Develop

```bash
git clone https://github.com/N9601/FlowCAD.git
cd FlowCAD
npm install
npm run dev            # http://localhost:5183
```

Build a production bundle:

```bash
npm run build          # dist/ ready to serve statically
```

Typecheck only:

```bash
npx tsc --noEmit
```

---

## Project layout

```
FlowCAD/
├── src/
│   ├── main.ts                Bootstraps every module against #app, #scene, #toolbar, #panel
│   ├── viewport.ts            three.js scene, camera, composer, PBR env, shadows, GTAO, outline
│   ├── document.ts            CadDocument: objects, selection, gizmo, undo, groups, arrays
│   ├── actions.ts             Shared add / combine / fillet / chamfer entry points
│   ├── catalog.ts             Shape defaults and dimension validation
│   ├── materials.ts           PBR presets + density for weight estimation
│   ├── csg/                   Manifold WASM worker, protocol, promise client
│   │   ├── csg.worker.ts      Primitives, booleans, fillet/chamfer, loft, section, validate
│   │   ├── protocol.ts        Typed request messages and CsgNode tree
│   │   ├── gear.ts            Involute spur gear profile
│   │   ├── thread.ts, iso.ts  ISO 68-1 thread + fastener size tables
│   │   └── shapes.ts, text.ts, profile.ts, pipe.ts
│   ├── palette.ts             Categorized left shape palette
│   ├── panel.ts               Object list + properties editor
│   ├── toolbar.ts             Toolbar buttons, hotkeys, arrow-key nudge
│   ├── toolspanel.ts, arrange.ts   Layout tools (drop, mirror, align)
│   ├── measure.ts             Measure tool with corner snapping
│   ├── section.ts             X/Y/Z cross-section
│   ├── section-plane.ts       Live section clip with Z slider
│   ├── printcheck.ts, printfix.ts, printpanel.ts   FDM print check + auto-fix
│   ├── physics.ts             cannon-es gravity settle
│   ├── console.ts, script.ts  Script drawer + bundled showcase scenes
│   ├── command-palette.ts, palette-commands.ts   Ctrl+K palette + registry
│   ├── contextmenu.ts, help.ts, welcome.ts       Right-click, ? overlay, first-visit tour
│   ├── stats.ts, coord-readout.ts, toast.ts      Overlays and notifications
│   ├── theme.ts, units.ts, units-ui.ts           Light/dark, mm/inch
│   ├── navcube.ts, views.ts, explode.ts          Nav compass, named views, explode slider
│   ├── annotations.ts, draw.ts, guides.ts        Notes, sketch tool, alignment guides
│   ├── history-panel.ts, layers.ts               Snapshot restore, slicer-style layer preview
│   ├── record.ts              MediaRecorder WebM turntable capture
│   ├── clipboard.ts           System Ctrl+C / Ctrl+V
│   ├── storage.ts             IndexedDB autosave + snapshot history
│   └── io/                    STL, OBJ, GLB, PLY, 3MF, SVG/DXF section, blueprint SVG,
│                              standalone HTML viewer, .flowcad JSON, BOM CSV, ZIP, winding
├── public/                    Static assets
├── index.html                 Vite entry
├── package.json               Vite + TypeScript + three + manifold-3d
└── README.md
```

---

## Built with

- [three.js](https://threejs.org/) (MIT)
- [Manifold](https://github.com/elalish/manifold) (Apache 2.0)
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) (MIT)
- [opentype.js](https://github.com/opentypejs/opentype.js) (MIT)
- [cannon-es](https://pmndrs.github.io/cannon-es/) (MIT)
- [Roboto](https://fontsource.org/fonts/roboto) (OFL 1.1)

---

## License

MIT. See [LICENSE](./LICENSE).

---

<div align="center">

**v1.0.0.** First stable release.
Modeling, editing, PBR, print check, scripting, blueprint and mesh export.

[Issues](https://github.com/N9601/FlowCAD/issues)

</div>
