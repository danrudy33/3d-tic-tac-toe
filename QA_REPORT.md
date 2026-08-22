# QA Report — 3×3×3 Tic-Tac-Toe

Date: 2026-08-21
Task: `t_80ce45eb`
Scope: independent release reverification after the draw-contract correction

## Final verdict

# PASS WITH NOTES

The corrected release contract is internally consistent and independently verified. `SPEC.md`, `README.md`, implementation tests, and QA evidence now all state and prove that a legal draw is unreachable with the canonical 49 winning lines. The reducer's `draw` branch is consistently documented and tested only as defensive handling for malformed or preconstructed state. No release blockers were found.

## Draw-contract reverification

- `SPEC.md:168,183-184` defines the full-board draw branch as unreachable through legal play and retained only as defensive hardening.
- `SPEC.md:269-270` requires an exhaustive zero-survivor proof and explicitly prohibits representing the synthetic draw fixture as reachable legal play.
- `README.md:50,94,116` states the same unreachable-draw contract and exhaustive-proof requirement.
- `src/game/winningLines.test.ts:47-76` deterministically enumerates/prunes both X/O assignments and asserts exactly zero winner-free complete assignments.
- `src/game/state.test.ts:51-64` proves a final-move line ends in `won` before the defensive draw branch.
- `src/game/state.test.ts:67-86` names the draw fixture malformed, proves it already contains an O win, and tests the defensive branch without claiming legal reachability.
- `qa-evidence/draw-validation.test.ts` independently reports `no-draw-coloring; visited-assignments=3297`.

## Command evidence

### Unit tests

Command: `npm run test`

Result: PASS

- Final test files: 4 passed (3 implementation suites plus 1 independent QA suite)
- Final tests: 24 passed (23 implementation tests plus 1 independent QA test)
- Final duration: 382 ms
- Covered coordinate validation, immutable transitions, representative axis/face/space wins, post-game no-op, reset, generated line invariants, and all 49 generated lines.

### Independent draw-model validation

Command: `npx vitest run qa-evidence/draw-validation.test.ts`

Result: PASS

- Test files: 1 passed
- Tests: 1 passed
- Exhaustive search result: no full 14-X/13-O coloring avoids all 49 winning lines.
- Visited assignments after sound early pruning: 3,297.

### Typecheck

Command: `npm run typecheck`

Result: PASS (`tsc --noEmit`, exit 0)

### Production build

Command: `npm run build`

Result: PASS

- Vite 7.3.6
- 13 modules transformed
- `dist/index.html`: 0.49 kB (0.32 kB gzip)
- CSS: 3.27 kB (1.27 kB gzip)
- JS: 512.29 kB (129.01 kB gzip)

Build note: Vite emitted its advisory warning because the minified JS chunk is 512.29 kB, above the default 500 kB threshold. This is not a functional release blocker for the MVP.

### Dependency audit

Command: `npm audit --omit=dev`

Result: PASS — 0 production vulnerabilities.

## Rules verification

| Requirement | Evidence | Result |
|---|---|---|
| Coordinate ids 0–26 round-trip and reject invalid values | `coordinates.test.ts` | PASS |
| Canonical winning-line total | `WINNING_LINES.length === 49` | PASS |
| Unique, valid, collinear, lexicographically ordered lines | `winningLines.test.ts` | PASS |
| Category counts | axis 27, face 18, space 4 | PASS |
| Every legal line recognized | exhaustive loop across all 49 lines | PASS |
| X starts and accepted moves alternate | reducer tests + browser semantic flow | PASS |
| Occupied-cell rejection | same reducer object; browser raycast and keyboard attempts remain at one occupied cell and O's turn; live text `Cell occupied` | PASS |
| Post-game lockout | browser win leaves 5 occupied cells, 0 enabled controls; subsequent activation leaves state unchanged and announces `Game over. Reset to play again.` | PASS |
| Final-move win precedence over defensive draw | reducer unit test | PASS |
| Legal draw reachability | implementation and independent exhaustive searches both find zero winner-free complete assignments | PASS — unreachable by contract |
| Defensive malformed-state draw handling | explicitly malformed reducer fixture; no legal-reachability claim | PASS |
| Reset from play/win/defensive draw-shaped states | reducer tests; browser reset | PASS |

## Browser evidence

Runner: Playwright 1.55.0 with Chromium 140.0.7339.16, headless, against Vite at `http://127.0.0.1:5173/`.

Command: `node qa-evidence/browser-smoke.mjs`

Result: PASS

### Desktop 1440×900

- Initial status: `X's turn`.
- Exactly 27 empty enabled semantic controls.
- Canvas CSS/backing size: 1440×900.
- No horizontal overflow.
- Named reset button, focusable/named canvas, named grid, and polite live region present.
- Semantic cell 0 placement produced one X, disabled that cell, left 26 enabled cells, and changed status to `O's turn`.
- Center canvas raycast placed exactly one mark.
- Repeating the same raycast and keyboard activation did not add a mark or change turns and announced `Cell occupied`.
- Scripted sequence 0, 3, 1, 4, 2 produced `X wins`, exactly three `data-winning="true"` controls, zero enabled cells, clear yellow winning pieces, and a connecting line.
- Post-game activation was rejected.
- Reset restored 27 empty enabled controls, `X's turn`, and no winning attributes.
- Pointer drag changed the view without placing a mark.
- Wheel input changed the rendered zoom.
- Reset did not recreate `BoardView`; paired screenshots show the same post-drag board orientation after game reset. Minor pixel/hash differences came from transient hover/focus overlay state, not camera reset.
- Fresh-page Tab order reached Reset first and Canvas second; keyboard focus outline computed as `solid`.
- Canvas arrow/Page key navigation and Space placement passed.
- Semantic grid arrow navigation moved cell 0 → cell 1; Enter placement passed.
- Console errors and uncaught page errors: 0.

### Mobile 320×568

- Status and reset remained visible.
- Reset height: 44 CSS px.
- Canvas CSS/backing size updated to 320×568.
- Horizontal overflow: 0.
- The board remained rendered and usable. When the optional semantic grid is expanded it overlays much of the lower board, but the grid itself remains usable and the canvas is supplementary; this is noted as polish rather than a blocker.

### Reduced motion

- `(prefers-reduced-motion: reduce)` matched.
- CSS transition duration computed as `0s`.
- Placement updated immediately to `O's turn` with one occupied cell.

### Visual inspection

- Three horizontal board layers were visually distinguishable on desktop.
- X and O were distinct by geometry and color.
- Winning X pieces and the connecting line were clearly emphasized in yellow; unrelated O marks remained visible.
- HUD status and reset were legible at desktop and phone sizes.
- No severe visual ambiguity was observed.

Evidence files:

- `qa-evidence/browser-smoke.mjs`
- `qa-evidence/draw-validation.test.ts`
- `qa-evidence/desktop-initial.png`
- `qa-evidence/desktop-win.png`
- `qa-evidence/mobile-320x568.png`
- `qa-evidence/canvas-after-drag.png`
- `qa-evidence/canvas-after-reset.png`
- `qa-evidence/canvas-after-zoom.png`

## Non-blocking notes

1. Production JS is 512.29 kB minified, triggering Vite's 500 kB advisory threshold.
2. `BoardView.animate()` schedules `requestAnimationFrame` continuously, including reduced-motion mode. State feedback is correct, but this misses the specification's render-on-demand performance preference.
3. The expanded mobile semantic grid overlays the board rather than following it in document flow. It remains functional, but a less obstructive mobile presentation would improve simultaneous visual/semantic play.

## Acceptance summary

- Build/typecheck/unit-test gates: PASS (24/24 tests; typecheck and production build exit 0).
- Canonical 49-line rules model: PASS (27 axis, 18 face, 4 space; all 49 recognized).
- Corrected draw contract: PASS (legal draws proven unreachable; defensive branch clearly separated from legal play).
- Gameplay, lockout, reset, highlighting, raycast, camera, resize, keyboard/focus, reduced motion, and console smoke checks: PASS.
- Fresh visual inspection: PASS; desktop initial/win states are clear, the canonical winning line is strongly emphasized, unrelated marks remain visible, and the 320×568 layout has no horizontal clipping. The expanded mobile semantic grid obscures part of the supplementary canvas but remains usable.

Release verdict: PASS WITH NOTES.
