# 3D Tic-Tac-Toe MVP Specification

Status: implementation contract  
Scope: browser-only local and bot play MVP

## 1. Product goal

Deliver a fast, polished, responsive 3×3×3 Tic-Tac-Toe game that two people can play on one device. The board must be easy to inspect in 3D, every move must be unambiguous, and a win must be announced immediately.

### In scope

- Local two-player play plus deterministic play against the built-in bot, with human-side selection.
- One permanent ruleset titled `Most Three in a Row Lines Wins`, with an accessible `How to play` dialog.
- A 3×3×3 board with 27 playable cells.
- Click/tap and keyboard-accessible placement.
- Orbit and zoom camera controls.
- Turn, win, and invalid-placement feedback, plus defensive handling of an unreachable draw state.
- Winning-line emphasis and reset.
- Responsive desktop, tablet, and phone layouts.

### Explicitly out of scope

- Accounts, identity, persistence, analytics, or a backend.
- Networked multiplayer, matchmaking, chat, or spectators.
- AI opponents, variants, timers, scoring history, or replays.
- Databases, asset pipelines, physics, or custom 3D models.

## 2. Architecture

Use Vite + TypeScript + Three.js as a static single-page application. There is no router and no backend. All authoritative game state is plain TypeScript data; Three.js renders state but never owns rules or turn progression.

Dependencies should remain minimal:

- Runtime: `three` only.
- Development: `vite`, `typescript`, `vitest`, `@types/three`, and browser-test tooling only if QA requires it.
- No UI framework is required. Use semantic DOM and CSS for the HUD and accessible controls.

The application has three layers:

1. **Rules/domain:** coordinates, canonical winning lines, immutable move/reset transitions, and selectors. It imports no DOM or Three.js modules.
2. **View/controller:** Three.js scene, raycasting, camera controls, visual synchronization, and translation from a picked mesh to a cell id.
3. **DOM shell:** status, reset, instructions, live announcements, and an accessible 27-cell move picker synchronized with the same game state.

The controller dispatches domain actions, then renders the returned state into both the scene and DOM. It must not mutate board data directly.

## 3. Coordinate and identity model

### Logical coordinates

A cell is an integer tuple `(x, y, z)` where each component is in `{-1, 0, 1}`:

- `x`: left (`-1`) to right (`1`).
- `y`: bottom (`-1`) to top (`1`).
- `z`: front (`-1`) to back (`1`) from the initial camera view.

Three.js uses the same right-handed axes and logical orientation. A mesh position is:

```text
worldPosition = (x * CELL_SPACING, y * CELL_SPACING, z * CELL_SPACING)
```

`CELL_SPACING` is a view constant and must not enter the rules layer.

### Canonical cell id and order

The canonical numeric id is:

```text
cellId(x, y, z) = (x + 1) + 3 * (y + 1) + 9 * (z + 1)
```

Therefore ids are integers `0..26`, `x` varies fastest, then `y`, then `z`. The inverse is deterministic:

```text
x = (id % 3) - 1
y = (floor(id / 3) % 3) - 1
z = floor(id / 9) - 1
```

Rules state uses ids as array indexes. Public coordinate helpers must reject non-integers and out-of-range values rather than clamp them.

### Required domain types

```ts
type Player = 'X' | 'O'
type Cell = Player | null
type GameStatus = 'playing' | 'won' | 'draw'
type CellId = number // runtime-validated integer 0..26

type GameState = {
  board: readonly Cell[] // exactly 27 entries
  currentPlayer: Player
  status: GameStatus
  winner: Player | null
  winningLine: readonly [CellId, CellId, CellId] | null
  moveCount: number
}
```

## 4. Canonical winning lines

A winning line is exactly three collinear cells at unit logical spacing. The canonical total is **49**.

| Category | Definition | Count |
|---|---|---:|
| Axis-aligned | One changing axis; other two fixed | 27 |
| Face/plane diagonal | Two changing axes; third fixed | 18 |
| Space diagonal | All three axes changing | 4 |
| **Total** |  | **49** |

Breakdown:

- Axis-aligned: 3 axis directions × 3 × 3 choices for fixed coordinates = 27.
- Face diagonals: 3 plane orientations × 3 fixed slices × 2 diagonals = 18.
- Space diagonals: the four corner-to-opposite-corner lines through the cube center = 4.

### Generator contract

`src/game/winningLines.ts` must generate, not hand-maintain, the canonical list:

1. Enumerate direction vectors `d = (dx, dy, dz)` with each component in `{-1, 0, 1}`, excluding `(0, 0, 0)`.
2. Keep one orientation per axis by requiring the first non-zero component in `(dx, dy, dz)` to be positive.
3. For every coordinate `a`, keep it as a start only when `a - d` is out of bounds and both `a + d` and `a + 2d` are in bounds.
4. Convert `[a, a+d, a+2d]` to cell ids, sort each line numerically, remove duplicates defensively, then sort the list lexicographically.
5. Export the frozen result as `WINNING_LINES`.

Classification uses the number of non-zero direction components: one = axis, two = face/plane diagonal, three = space diagonal.

Generator tests must prove:

- exactly 49 unique lines;
- every line has three distinct ids in `0..26`;
- every line is collinear at equal spacing when converted back to coordinates;
- category counts are exactly 27, 18, and 4;
- every cell referenced by a line has a valid inverse coordinate;
- `WINNING_LINES` is stable in lexicographic canonical order.

If a move completes multiple lines, `winningLine` is the lexicographically first completed line in `WINNING_LINES`. The visual layer may highlight all completed lines later, but the MVP stores and highlights this one canonical line.

## 5. Rules and state transitions

### Initial state

- `board` is 27 `null` entries.
- `currentPlayer` is `X`.
- `status` is `playing`.
- `winner` and `winningLine` are `null`.
- `moveCount` is `0`.

### Actions

The domain supports only:

```ts
type GameAction =
  | { type: 'PLACE'; cellId: CellId }
  | { type: 'RESET' }
```

### PLACE transition

In this exact order:

1. Reject the action without changing state if status is not `playing`.
2. Reject the action without changing state if `cellId` is invalid or occupied.
3. If `moveCount === 0`, reject center cell 13 without changing state; after X accepts a different cell, center is legal for O.
4. Copy the board, place `currentPlayer`, and increment `moveCount`.
5. Count completed canonical lines for both players, including overlapping lines; do not terminate early.
6. If `moveCount === 26`, compare final scores: higher score sets `status='won'` and the matching winner; equal scores set `status='draw'`.
7. Otherwise toggle `currentPlayer` and remain `playing`.

Rejected moves return the same state object so callers can identify a no-op. Accepted actions return a new state and board; previous state remains unchanged.

The terminal board must contain exactly 13 X marks, 13 O marks, and one empty cell.

The HUD exposes persistent `X lines N · O lines N` and `Marks: X N/13 · O N/13` chips. Only lines newly completed by the latest placement receive a brief non-looping pulse. Terminal text includes the score, for example `O wins — 6 lines to 4` or `Draw — 5 lines each`.

### RESET transition

Return a fresh initial state from any status. Reset preserves the user's current camera orientation and zoom while clearing hover, focus, invalid-move, and winning-line effects. The initial camera pose is applied only at application startup.

### Local play behavior

- X always starts a new game.
- One mark is allowed per cell.
- A player cannot pass or undo in the MVP.
- No moves are accepted after win or draw until reset.
- Equal final line scores produce a legal draw.

## 6. Interaction and controls

### Pointer and touch

- Click/tap a legal empty cell to place the active player's mark; opening-locked cells have no hover/selection feedback.
- The visible and accessible label `Select layer for easier placement` names the segmented `All / Front / Middle / Back` filter, which constrains pointer and keyboard selection without changing game state or camera state. Back maps to ids 0–8 (`z=-1`), Middle to 9–17 (`z=0`), and Front to 18–26 (`z=1`). Desktop buttons are compact 32px controls; below 640px they become four equal-width 44px targets.
- Pointer drag rotates/orbits the board.
- Mouse wheel and touch pinch zoom within limits that keep the entire cube inspectable.
- A drag must not place a mark. Treat pointer movement beyond a small view constant (recommended 6 CSS px) as camera intent.
- Hover or touch focus previews the target cell without looking like a committed mark.
- Clicking an occupied cell gives brief non-destructive feedback and does not change turns.
- Reset is a semantic `<button>` outside the canvas.
- `How to play` opens a modal dialog covering the opening-center restriction, 13 marks each, one empty cell, no early termination, canonical 49-line scoring, overlaps, and ties. Close and Escape dismiss it, focus stays inside while open and returns to the opener, and opening/closing it cannot mutate game state.
- At 640px and wider, controls occupy a reserved sidebar that never overlays the board. Below 640px, a persistent score/status bar and `Game controls` button precede the board; the remaining controls are inert and collapsed by default in a scrollable, layout-participating drawer. Opening or closing the drawer cannot mutate game, layer, camera, or zoom state, and Escape closes it with focus returned to the toggle.

Use `OrbitControls` with damping. Disable panning. Choose conservative polar angle and distance limits so the board cannot be lost or flipped into an incomprehensible view.

### Keyboard and assistive input

The DOM includes a labeled `role="grid"` move picker with 27 semantic buttons in canonical id order. Each button exposes coordinate and occupancy, for example: `x 1, y 0, z -1, empty`. The picker and 3D view dispatch the same `PLACE` action.

- Tab reaches the board controls and reset.
- `[` and `]` cycle All → Front → Middle → Back with wraparound and announce the persistent `Selecting: …` status through the polite live region.
- Arrow-key navigation within the move picker is deterministic and documented in the UI; Enter or Space places a mark.
- Occupied, opening-locked, bot-turn, or game-over cells are disabled.
- Focus remains visible and synchronized with the highlighted 3D cell.
- The canvas is supplementary visual output and does not replace semantic controls.

## 7. Visual and status behavior

- X and O must differ by both shape and color; do not rely on color alone.
- Empty targets, hover/focus, occupied cells, and newly scored lines must be visually distinct.
- The status area shows turn text during play and a scored final summary such as `X wins — 7 lines to 5` or `Draw — 6 lines each`.
- A `role="status" aria-live="polite"` region announces accepted turns, invalid occupied-cell attempts, wins, reset, and the defensive draw state if presented, without repeated announcements during camera motion.
- On win, emphasize the canonical winning three cells and de-emphasize unrelated marks without hiding them.
- Respect `prefers-reduced-motion`: disable damping-dependent decorative motion and nonessential transitions while preserving immediate state changes.
- Text and controls must meet WCAG AA contrast; interactive targets are at least 44×44 CSS px on touch layouts.

## 8. Responsive behavior and performance

- The app occupies available `100dvh` without mandatory page scrolling during normal play.
- At viewport widths `>= 720px`, use a board-first layout with HUD/instructions beside or over a non-obscuring edge.
- Below `720px`, use one column: compact status/actions above the largest square canvas that fits; instructions and the semantic move picker may follow in a collapsible details region.
- Account for safe-area insets and orientation changes. Recompute renderer size, camera aspect, and pixel ratio without resetting game state.
- Cap renderer pixel ratio at `min(devicePixelRatio, 2)`.
- The board remains usable at 320×568 CSS px and at 200% browser zoom.
- Target smooth interaction on a current mid-range phone and desktop; avoid per-frame allocations and render on demand except while damping/interaction requires frames.

## 9. File and module plan

```text
index.html
src/
  main.ts                  # bootstrap and dependency wiring
  styles.css               # responsive shell, focus, reduced motion
  game/
    coordinates.ts         # id/coordinate conversion and validation
    winningLines.ts        # canonical generator and WINNING_LINES
    state.ts               # types, initial state, reducer/transitions
    selectors.ts           # completed-line and status helpers
  scene/
    createScene.ts         # renderer, camera, lights, disposal
    boardView.ts           # 27 cells/marks and visual state sync
    picking.ts             # raycast target -> CellId
    cameraControls.ts      # OrbitControls and initial pose
  ui/
    hud.ts                 # status, reset, instructions, live region
    movePicker.ts          # semantic 27-cell grid and keyboard behavior
  app.ts                   # action dispatch and scene/DOM synchronization
  test/
    setup.ts
```

Tests mirror domain modules under `src/**/*.test.ts`; browser acceptance tests, if used, live under `e2e/`. Module names may change only if the same boundaries and ownership remain explicit in README.

## 10. Machine-checkable acceptance criteria

All criteria use stable IDs. The eventual project must expose scripts `npm run test`, `npm run typecheck`, and `npm run build`; each exits 0.

### Domain

- **AC-DOM-001:** coordinate tests exhaustively round-trip all ids `0..26`, produce 27 unique coordinate tuples, and reject ids `-1`, `27`, fractions, and non-numbers.
- **AC-DOM-002:** `WINNING_LINES.length === 49`, the serialized lines are unique, each line has three unique valid ids, and lines are lexicographically sorted.
- **AC-DOM-003:** category tests count exactly `{ axis: 27, face: 18, space: 4 }` and independently verify equal-step collinearity.
- **AC-DOM-004:** initial-state test asserts the exact fields and values in section 5, including 27 empty cells.
- **AC-DOM-005:** reducer tests assert X starts, accepted moves alternate players, occupied/invalid/game-over placement returns the same object, opening locks reject through ply eight without consuming a turn, ply nine unlocks them, and accepted placement is immutable.
- **AC-DOM-006:** table-driven tests complete at least one line from each category and assert the correct winner and canonical winning line.
- **AC-DOM-007:** an exhaustive deterministic test over the canonical `WINNING_LINES` proves that no complete assignment of X/O marks to all 27 cells avoids a monochromatic winning line. The search may prune a partial assignment as soon as it completes an X or O line, but it must assert that the number of surviving complete assignments is exactly `0`. A separate reducer test asserts that a final move completing a line ends in `won`, not the defensive `draw` state.
- **AC-DOM-008:** reset tests from playing, won, and a synthetically constructed defensive draw state return the exact initial state values; the draw-shaped fixture must not be represented as reachable legal play.

### Integration and UI

Stable test hooks are required: `[data-testid="game-status"]`, `[data-testid="reset-game"]`, `[data-testid="board-canvas"]`, and `[data-cell-id="0"]` through `[data-cell-id="26"]` on semantic move controls.

- **AC-UI-001:** a browser test loads the app with no console errors and finds exactly 27 enabled empty move controls, status `X's turn`, a canvas, and reset.
- **AC-UI-002:** activating cell 0 through the semantic control renders X there, disables that control, changes status to `O's turn`, and leaves 26 empty controls.
- **AC-UI-003:** attempting the same occupied cell through picking or the domain integration does not change `moveCount`, board serialization, or current player and produces an accessible invalid-move announcement.
- **AC-UI-004:** a scripted line win changes status to `X wins` or `O wins`, disables all empty move controls, and marks exactly the canonical three controls with `data-winning="true"`.
- **AC-UI-005:** reset after at least one move restores 27 empty enabled controls, `X's turn`, and no winning attributes while preserving camera orientation and zoom.
- **AC-UI-006:** keyboard-only test reaches reset and all playable cells, places with Enter and Space, and exposes visible focus.
- **AC-UI-007:** accessibility scan reports no serious or critical violations; the status live region, named grid, named cells, and named reset button are present.
- **AC-UI-008:** at 320×568 and 1440×900 viewports, the status, reset, canvas, and current-player cue fit without horizontal overflow; canvas backing dimensions update after viewport resize.
- **AC-UI-009:** with reduced motion emulation enabled, move, win, and reset state changes remain immediate and no nonessential transition or continuous camera animation is required.
- **AC-UI-010:** pointer drag changes camera orientation without increasing `moveCount`; click/tap on an empty target increases it exactly once; wheel/pinch zoom remains within configured limits.

### Build and scope gates

- **AC-BLD-001:** `npm run test`, `npm run typecheck`, and `npm run build` all exit 0.
- **AC-BLD-002:** production output is a static site and contains no server entry point, database client, authentication library, network multiplayer code, or required runtime environment variables.
- **AC-BLD-003:** README documents setup, controls, architecture boundaries, coordinate identity, the 49-line count, and scope exclusions.

## 11. Definition of done

The MVP is done only when all acceptance IDs pass, the production build runs as a static site, two people can complete and reset a game with pointer/touch or keyboard controls, and QA has verified the 49-line rules contract on desktop and phone-sized viewports.
