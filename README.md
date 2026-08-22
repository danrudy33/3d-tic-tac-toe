# 3D Tic-Tac-Toe

## Most Three in a Row Lines Wins

> A browser-based 3×3×3 strategy game for local two-player matches or deterministic play against the built-in bot.

[**Play online**](https://danrudy33.github.io/3d-tic-tac-toe/)

![3D Tic-Tac-Toe — 3D board](qa-evidence/desktop-initial.png)

Players fill 26 of the cube's 27 cells, count every completed three-in-a-row among 49 canonical lines, and compare final scores. The game prioritizes clear rules, fast interaction, focused layer selection, and equivalent keyboard-accessible move controls.

The implementation contract and machine-checkable acceptance criteria are in [SPEC.md](./SPEC.md); the visual system is documented in [DESIGN.md](./DESIGN.md).

## MVP scope

Included:

- Local X-versus-O play or deterministic play against the built-in bot, with human-side selection.
- One permanent ruleset: **Most Three in a Row Lines Wins**.
- 27 cells, valid placement, alternating turns, live line scoring, final win/draw comparison, and reset.
- Orbit and bounded zoom for inspecting the cube.
- Pointer, touch, and keyboard-accessible placement.
- Responsive layout and clear status/winning-line feedback.

Not included:

- Backend services, accounts, persistence, or analytics.
- Online multiplayer, matchmaking, chat, or spectators.
- Timers, replays, or score history.
- Databases or an asset pipeline.

## Setup and commands

Requires a current Node.js release (Node 20.19+ or 22.12+ is recommended by Vite 7).

```sh
npm install
npm run dev
npm run test
npm run typecheck
npm run build
```

`npm run dev` starts Vite's local development server. `npm run build` writes the static production site to `dist/`; it requires no server application, runtime environment variables, or backend. `npm run test` executes the deterministic rules suite with Vitest.

## Rules in brief

X cannot place in center cell 13 on the first move; after X places elsewhere, every empty cell—including center for O on move two—is legal. X and O alternate until each has placed exactly 13 marks, leaving one cell empty after 26 accepted plies. Completing a line never ends play early. The HUD continuously counts each player's distinct completed lines among the canonical 49, including overlapping lines. After ply 26, the higher line count wins and equal counts draw. The built-in bot uses a deterministic score-aware heuristic that prioritizes immediate line gain and blocking line gain.

The proposed **84% draw rate** is recorded as an unverified hypothesis; it is not a product claim until the routine-play policy, simulation assumptions, seed, sample size, and reproducible analysis are supplied.

The canonical winning-line set contains **49** lines:

- 27 axis-aligned lines.
- 18 diagonals within a plane/slice.
- 4 corner-to-corner space diagonals.

Every distinct completed canonical line counts once for its owner. A placement can add multiple overlapping lines, and none ends the game early.

## Prior art and further reading

These sources document related rules, board structures, and mathematical background. They do **not** establish unpublished solver values, node counts, opening tables, or playout statistics for this implementation.

- [Math Things — 3-Dimensional Tic-Tac-Toe](https://maththings.net/3dimensional-tictactoe) documents a 3×3×3 physical game with a move-one center restriction, continued play after a line, and tally scoring on a filled board.
- [What Do We Do All Day — 8 Tic-Tac-Toe Variations](https://www.whatdowedoallday.com/tic-tac-toe-variations/) includes a 5×5 scoring game with equal mark counts, one blank square, and an explicit choice about whether marks may belong to overlapping lines.
- [Alyssa S. Choi — Tic-Tac-Toe (National Museum of Mathematics)](https://momath.org/wp-content/uploads/2021/08/Alyssa-Choi-Tic-Tac-Toe.pdf) analyzes 3×3×3 race-format play and argues that a filled standard board cannot avoid a completed line.
- [Alec Levine — Exploring Tic-Tac-Toe Variants](https://erich-friedman.github.io/research/levine.pdf) surveys higher-dimensional variants and analyzes first-player advantage on a 3×3×3 board.
- [NRICH — Marbles in a Box](https://nrich.maths.org/problems/marbles-box) gives several systematic derivations of the cube's 49 lines, including the 27 axis-aligned, 18 planar-diagonal, and 4 space-diagonal breakdown.

## Coordinate model

Logical coordinates are integer tuples `(x, y, z)` with each component in `{-1, 0, 1}`:

- `x`: left to right.
- `y`: bottom to top.
- `z`: front to back from the initial camera.

The canonical cell id is:

```text
id = (x + 1) + 3 * (y + 1) + 9 * (z + 1)
```

Ids therefore run from 0 through 26, with x changing fastest. The game state stores cells in this order. Three.js world positions use the same axis orientation, multiplied by a view-only spacing constant.

## Controls

- Choose **Two players** for local play or **Play against bot** for automatic deterministic replies.
- Use **How to play** for a concise accessible rules dialog; closing it never changes game state.
- In bot mode, choose whether the human plays X (first) or O (second); changing sides resets the board, and the bot opens automatically when the human chooses O.
- Under **Select layer for easier placement**, use **All / Front / Middle / Back** to focus selection on one z plane without moving the camera. Front is ids 18–26, Middle is 9–17, and Back is 0–8; `[` and `]` cycle the filter.
- Click or tap an unlocked empty cell: place the current mark.
- Drag: orbit the board without placing a mark.
- Wheel or pinch: bounded zoom.
- Keyboard on the canvas or labeled 27-cell grid: Left/Right change x, Up/Down change z, Page Up/Page Down change y, and Enter or Space places.
- Reset button: clear the board and return to X without moving the camera.

The canvas is supplementary visual output. Semantic controls expose all moves, occupancy, coordinates, status, and reset to keyboard and assistive-technology users.

## Architecture boundaries

```text
src/game/   Pure coordinates, 49-line generator, state transitions, selectors
src/scene/  Three.js scene, board primitives, raycasting, and OrbitControls
src/app.ts  Semantic HUD/grid, action dispatch, and synchronization
src/main.ts Bootstrap and stylesheet entry
```

The rules layer imports neither Three.js nor the DOM. `BoardView` owns view-only spacing, camera state, hit targets, and visual effects. Both raycast selection and semantic controls call the same reducer-backed `place` path. Reset replaces only game state, so the existing camera and zoom remain untouched.

Important decisions:

1. Game state is authoritative; rendered meshes never own rules.
2. Winning lines are generated canonically and tested, not hand-maintained.
3. Rejected placements are reducer no-ops and do not advance the turn.
4. Completed lines score immediately, but winner/draw evaluation occurs only after accepted ply 26.
5. The visual canvas and semantic move picker dispatch the same action.
6. Renderer pixel ratio is capped at 2 and resize never resets game state.
7. Runtime networking and environment variables are unnecessary for the MVP.
8. Reset preserves the user's camera orientation and zoom.

## Responsive and accessibility baseline

The normal play surface fits within `100dvh`. At 720 px and wider, the board uses a board-first layout with adjacent or edge HUD; narrower layouts stack compact status/actions above the largest fitting square canvas. The target minimum viewport is 320×568 CSS px, including support for safe areas and 200% zoom.

X and O differ by shape and color. Focus is visible, touch targets are at least 44×44 CSS px, status updates use a polite live region, reduced-motion preferences are respected, and text/control contrast targets WCAG AA.

## Delivery gates

Implementation is not accepted until all of these exit successfully:

```sh
npm run test
npm run typecheck
npm run build
```

The detailed acceptance IDs in `SPEC.md` cover coordinate round trips, 49 unique lines with category counts 27/18/4, immutable state transitions, overlapping-line scoring, exact 13/13 mark counts, final winner/draw comparison, semantic controls, camera/input separation, accessibility, responsive viewports, and static-build scope.

## Project files

- `src/game/coordinates.ts`: runtime-validated id/coordinate conversion.
- `src/game/winningLines.ts`: generated, frozen, lexicographically sorted 49-line set.
- `src/game/state.ts`: immutable initial state and `PLACE`/`RESET` reducer.
- `src/game/selectors.ts`: completed-line selector.
- `src/scene/boardView.ts`: primitive board/pieces, bounded orbit/zoom, resizing, raycasting, hover/focus, and win treatment.
- `src/app.ts`: accessible status, live announcements, reset, and semantic 27-cell move grid.

## License

3D Tic-Tac-Toe is available under the [MIT License](LICENSE).
