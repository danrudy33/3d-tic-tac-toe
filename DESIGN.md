---
version: alpha
name: Spatial Grid
description: A quiet, high-contrast interface that makes a 3x3x3 game readable before it becomes decorative.
colors:
  primary: "#F4F7FB"
  secondary: "#A9B4C6"
  tertiary: "#56C8FF"
  background: "#0B1020"
  surface: "#151D31"
  surfaceRaised: "#202B45"
  boardLine: "#71809A"
  x: "#5DD6FF"
  o: "#FFB454"
  valid: "#8DEBCA"
  win: "#F8E16C"
  focus: "#FFFFFF"
typography:
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 1.25rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 0.75rem
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0.08em
rounded:
  sm: 6px
  md: 10px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  hud-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  button-reset:
    backgroundColor: "{colors.surfaceRaised}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: 12px
    height: 44px
  button-reset-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    rounded: "{rounded.sm}"
    padding: 12px
    height: 44px
  turn-x:
    backgroundColor: "{colors.x}"
    textColor: "{colors.background}"
    rounded: "{rounded.pill}"
    padding: 8px
  turn-o:
    backgroundColor: "{colors.o}"
    textColor: "{colors.background}"
    rounded: "{rounded.pill}"
    padding: 8px
  board-guide:
    backgroundColor: "{colors.boardLine}"
  hover-cell:
    backgroundColor: "{colors.valid}"
  keyboard-focus:
    backgroundColor: "{colors.focus}"
  winning-line:
    backgroundColor: "{colors.win}"
three:
  cellSpacing: 1.35
  cellHitSize: 1.08
  boardExtent: 3.78
  pieceScale: 0.72
  lineRadius: 0.025
  layerSeparation: 1.35
  cameraFov: 42
  cameraNear: 0.1
  cameraFar: 100
  cameraDistance: 8.6
  cameraMinDistance: 5.8
  cameraMaxDistance: 12
  cameraMinPolarDegrees: 35
  cameraMaxPolarDegrees: 82
  hoverDurationMs: 120
  winDurationMs: 360
---

## Overview

Spatial Grid should read as a game board first and a 3D scene second. Use only Three.js primitives, flat colors, one restrained light rig, and DOM HUD elements. The player must be able to answer three questions at a glance: whose turn is it, which cells are occupied, and what can I select?

Core principles:

- Preserve empty space between layers; depth is communicated by parallax, occlusion, and subtle layer guides rather than transparent cubes.
- Never encode X/O ownership by color alone. Geometry is the primary distinction; color reinforces it.
- Keep the scene quiet until interaction. Hover and win states are the brightest elements.
- Do not add textures, particles, bloom, post-processing, custom fonts, or downloaded assets for the MVP.

## Colors

The canvas and page use `background`. DOM surfaces use `surface`; raised controls use `surfaceRaised`. Board guides use `boardLine` at 45% opacity, but occupied pieces render fully opaque.

- X: cyan `x`, formed from two crossed bars.
- O: amber `o`, formed from a torus.
- Valid hover: mint `valid` with a thin emissive-looking outline or translucent fill.
- Win: yellow `win` applied to all three winning pieces and the connecting line.
- Invalid/occupied feedback: do not flash red during normal pointer exploration. Keep the cell non-highlighted and use `not-allowed` only if an occupied hit target is intentionally retained.

Contrast requirements:

- DOM text must meet WCAG AA: 4.5:1 for body text and 3:1 for large text and UI boundaries.
- The pale foreground on dark surfaces exceeds the target; do not lower primary text opacity below 90%.
- The board must remain understandable in grayscale because X and O use different silhouettes.

## Typography

Use the system font stack; do not load Inter or any web font. The first available system face is acceptable. Use tabular numerals only if a move counter is added.

- `title`: game title only.
- `body`: turn status, outcome, and control text.
- `label`: short uppercase eyebrow such as `CURRENT TURN`; never use it for instructions.

Keep status language direct: `X to move`, `O to move`, `X wins`, `O wins`, or `Draw`. Mirror this exact text in an `aria-live="polite"` region.

## Layout

The HUD never overlays the canvas. Desktop and tablet reserve a 280–340px sidebar beside the board. Below 640px, show only turn/status, both score chips, mark progress, and a 44px `Game controls` button in a compact bar above the board; all other controls live in a collapsed-by-default drawer that participates in layout, scrolls internally, closes with Escape, and returns focus to its toggle.

### Board coordinate system

Use integer logical coordinates `x, y, z` in `[-1, 0, 1]`. Map each cell center to world position:

`worldPosition = logicalPosition * 1.35`

Treat `y` as vertical layer, `x` as left/right, and `z` as front/back. Document this mapping next to the implementation so state and rendering cannot disagree. The full center-to-center extent is 2.7 units per axis; guides extend to approximately +/-1.89 (`boardExtent / 2`) to leave breathing room around pieces.

### Board geometry

- Draw three horizontal 3x3 layer guides at `y = -1.35, 0, 1.35`.
- Each layer is four thin lines along X and four along Z, positioned halfway between cells and at the outer edges: `-1.89, -0.675, 0.675, 1.89`.
- Use `lineRadius` cylinders or `LineSegments`; guides are `boardLine` at 45% opacity. Avoid 27 visible cell boxes because overlapping transparent faces obscure depth.
- Add 12 faint vertical corner/partition connectors between layers at the grid intersections. Render at 20% opacity so layers remain the dominant cue.
- Create one invisible hit target per cell: a box centered on the cell, `1.08` units per side. Hit targets must not render and must carry the logical coordinate in `userData`.
- Render hit targets before choosing a move, but resolve raycast intersections by nearest distance. Ignore occupied cells when deriving the hover target.

### Piece geometry

Pieces fit inside a cell at `pieceScale = 0.72` of the spacing, leaving a clear air gap.

- X: two slim rectangular bars with square or lightly beveled ends, crossed at +/-45 degrees in the local XY plane. Group and billboard only around the vertical Y axis toward the camera so its silhouette remains an X from oblique views; do not fully billboard or it will break spatial placement.
- O: a torus facing the same local plane as X, with tube diameter about 20% of its outside diameter. It shares X's Y-axis orientation rule.
- Give both pieces a dark duplicate/backplate 3-5% larger or a subtle depth extrusion. This preserves silhouette when guides pass behind them.
- Do not use letters, sprites, or text meshes.

### DOM composition

Desktop at 768px and wider:

- Canvas fills the viewport.
- Place a compact HUD in the top-left, 16px from both edges, max width 280px.
- HUD order: title, turn/outcome row, one-sentence instruction.
- Place Reset in the top-right, 16px from both edges. Keep it outside orbit-drag gestures.

Mobile below 768px:

- Canvas remains full viewport, but reserve a 104px top safe area for controls.
- HUD spans left to right with 12px margins; title and status share the first row.
- Reset sits in the same panel at the row end. Instructions occupy a second row and may shorten to `Drag to orbit · Pinch to zoom · Tap to place`.
- Respect `env(safe-area-inset-top/right/left/bottom)`.
- Keep every control at least 44x44 CSS pixels and prevent canvas gestures from scrolling the page with `touch-action: none` on the canvas only.

## Elevation & Depth

Use a simple, stable scene:

- Ambient or hemisphere light at intensity near 1.2, plus one directional light from camera-upper-left near intensity 2.0.
- Use `MeshStandardMaterial` with roughness 0.55-0.7 and metalness 0-0.1 for pieces. Do not require shadows; silhouette and color do the work.
- Background is flat `background`; no floor plane is required.
- If antialiasing is available, cap renderer pixel ratio at `min(devicePixelRatio, 2)`.
- DOM HUD uses a solid or 94%-opaque surface. Avoid backdrop blur as a dependency; readability over the canvas must be deterministic.

### Camera defaults and constraints

- Perspective camera: 42 degree FOV, near 0.1, far 100.
- Initial position: approximately `(5.2, 4.6, 5.2)`, looking at `(0, 0, 0)`, equivalent to roughly 8.6 units distance.
- Enable orbit and pinch/wheel zoom; disable pan.
- Constrain distance to 5.8-12 units and polar angle to 35-82 degrees. Allow full azimuth rotation.
- Use damping around 0.08 in normal mode. Disable damping when reduced motion is requested.
- A double-click or dedicated recenter control is not required for MVP; Reset resets the game, not the camera.

## Shapes

The visual language is deliberately geometric:

- Board: thin square grid guides with softly rounded DOM panels.
- X: angular and crossed.
- O: circular and open.
- Hover: a rounded or beveled cube occupying roughly 82% of the hit target, shown as wireframe/outline where feasible.
- Focus: a crisp 2px white ring with 2px offset on DOM controls; never remove the browser focus indicator without replacing it.

## Components

### Valid hover and selection

Pointer movement over an empty cell shows exactly one hover marker:

- Mint outline or 16%-opaque mint cube centered on the target.
- Preview the current player's piece inside it at 35% opacity if this can be implemented without duplicate geometry complexity; the cell marker alone is sufficient for MVP.
- Animate scale from 0.92 to 1 over 120ms. Hide immediately when the pointer leaves the canvas, orbit drag begins, the target becomes occupied, or the game ends.
- Change the canvas cursor to `pointer` only over a valid empty cell; otherwise use `grab`, and `grabbing` while orbiting.

On selection, place the piece immediately. A 160ms scale-in from 0.75 to 1 is optional. Do not delay state commitment until animation completes.

Prevent accidental placements after orbiting: only select on pointer-up when movement since pointer-down is at most 6 CSS pixels and OrbitControls did not enter a change/drag gesture.

### Active-turn HUD

The status row is the strongest DOM element after the board:

- Display a compact X or O geometric/letter marker plus the exact status text.
- Tint the marker with `x` or `o`; keep the text `primary`.
- On turn change, update instantly. A 120ms opacity crossfade is optional.
- After win/draw, replace the turn label with the outcome and keep it stable until Reset.
- Show the permanent ruleset name `Most Three in a Row Lines Wins` beside a compact 44px `How to play` button. The button opens a focused modal with concise rules, a clear Close button, Escape dismissal, focus containment/return, and no game-state mutation. Persist high-contrast `X lines N · O lines N` and `Marks: X N/13 · O N/13` chips below turn status, briefly pulse only lines newly completed by the latest mark, and include final scores in the outcome text.

### Opening-locked cells

For accepted plies 1–8, show the cube center and eight corners dimmed with a compact lock marker. Exclude them from pointer hover and selection feedback, disable their semantic controls, and display `Corners and center unlock after both players place 4 marks. X N/4 · O N/4.` in the HUD. After O's fourth accepted move, fade the lock treatment out once over about 220ms without moving the camera; remove it immediately when reduced motion is requested.

### Layer focus

Show the muted 12–13px label `Select layer for easier placement` above the four-option `All · Front · Middle · Back` segmented control, and use that same text as its accessible name. Desktop buttons are 32px high with 8–10px horizontal padding and 4px gaps; the active option retains cyan fill and a visible 2px focus ring. Below 640px, switch to four equal-width 44px-high buttons. In a focused mode, constrain hit testing and keyboard selection to that z plane, keep its content at full opacity with a cyan 3×3 perimeter/grid treatment, fade other guides to 10% and their marks to 25%, and never move the camera. Keep persistent `Selecting: Layer` text, polite live announcements, and `[` / `]` cycling synchronized.

### Winning line

When one or more legal winning lines are present:

- Lock further placement immediately.
- Recolor the three pieces in the resolved winning line to `win` and raise emissive intensity modestly if using standard materials.
- Draw one solid `win` cylinder or thick line through the centers of the first and last winning cells, extended by about 0.18 units beyond each center. Make it clearly thicker than board guides (about 3x `lineRadius`).
- Dim non-winning pieces to 55% opacity and board guides to 25% opacity.
- Animate the line once over 360ms using scale along its axis. No looping pulse.
- If a final move completes multiple lines, highlight every winning piece but draw all completed winning lines only if it remains legible; cap animation to one simultaneous pass.

### Reset

Reset is always visible and remains enabled. It clears pieces, hover, win treatment, outcome, and the live status, then returns the turn to X. It must not change the camera orientation. Use a text button labelled `Reset game`; an icon-only control is not acceptable.

## Keyboard and Accessibility

The WebGL board cannot be pointer-only. Implement one practical keyboard model for the MVP:

- Canvas has `tabindex="0"`, an accessible label such as `3D tic-tac-toe board, 27 cells`, and a visible 2px focus outline.
- Maintain a logical keyboard cursor `(x, y, z)`, initially `(0, 0, 0)` or the first empty cell.
- Arrow Left/Right change X; Arrow Up/Down change Z. Page Up/Page Down change Y layer. Clamp at board bounds; do not wrap.
- Enter or Space places the current player's piece in the focused cell when valid.
- Render keyboard focus as the same mint cell marker plus a white outer edge so focus is distinguishable from pointer hover.
- Announce cursor movement in a visually hidden polite live region, for example `Center column, top layer, back row, empty`. Announce invalid activation as `Cell occupied` without changing turn.
- Do not hijack arrow or page keys unless the canvas currently has focus. Prevent their default page motion only while focused.
- Reset is a native `<button>` and follows the canvas in a sensible tab order. `Escape` may return focus to Reset but is optional.

Use semantic DOM for title, status, instructions, and button. Never attempt to make 27 invisible DOM buttons over projected cells; projection drift and camera movement make that fragile for the MVP.

## Reduced Motion

Under `prefers-reduced-motion: reduce`:

- Disable OrbitControls damping.
- Remove hover scale-in, piece scale-in, status crossfade, and winning-line growth.
- Apply final hover and winning styles instantly.
- Do not auto-rotate the board in any mode.

Animation is never required to understand state. Avoid flashing, camera shake, continuous glow pulses, and repeated celebratory motion.

## Do's and Don'ts

Do:

- Use one coordinate mapping for state, raycasting, keyboard focus, and win lines.
- Keep geometry opaque and guides sparse so depth survives camera rotation.
- Verify X and O remain distinct from front, side-oblique, and top-oblique views.
- Show one unambiguous selectable cell at a time.
- Keep the HUD readable at 320px width and with 200% browser zoom.

Don't:

- Render stacked translucent cell cubes or three glass boards.
- Encode ownership, turn, or victory with color alone.
- Let click-to-place fire at the end of an orbit drag.
- Hide Reset in a menu or move it as the camera rotates.
- Add bloom, textures, particles, sound, custom models, or an asset pipeline for the MVP.

### Acceptance criteria

- The board exposes 27 evenly spaced hit targets mapped to integer coordinates and three visibly separated horizontal layers.
- X and O use distinct geometry and colors, remain recognizable from constrained camera angles, and never rely on color alone.
- Exactly one valid empty cell receives hover/focus feedback; occupied cells cannot be selected.
- Orbiting, zooming, and placing do not conflict; a drag greater than 6px cannot place a piece.
- The HUD always shows whose turn it is or the terminal result, and its status is mirrored through `aria-live`.
- A win locks input, highlights the winning pieces and connecting line, and visually subordinates unrelated pieces.
- Reset is always visible, keyboard reachable, at least 44px high, and resets game state without moving the camera.
- Desktop and 320px-wide mobile layouts preserve board visibility, safe-area spacing, and readable controls.
- Canvas keyboard controls can navigate all 27 cells and place a piece without a pointer; visible focus is never suppressed.
- Reduced-motion mode removes nonessential transitions and damping without removing state feedback.
- The implementation uses only DOM/CSS and Three.js primitives; no external visual assets or post-processing pipeline are required.
