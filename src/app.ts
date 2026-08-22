import { chooseBotMove } from './game/bot'
import { coordinateFromId, type CellId } from './game/coordinates'
import {
  cellIsInLayer,
  cycleLayer,
  layerCellIds,
  layerLabel,
  type LayerSelection,
} from './game/layers'
import { gameStatusText } from './game/presentation'
import { lineScores } from './game/selectors'
import {
  createInitialState,
  gameReducer,
  isCellRestricted,
  type Player,
} from './game/state'
import { BoardView } from './scene/boardView'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('Missing #app root')

app.innerHTML = `
  <main class="game-shell" data-active-rules="fairest">
    <section class="hud" aria-labelledby="game-title">
      <div class="hud__topline">
        <div>
          <p class="eyebrow">SPATIAL GRID</p>
          <h1 id="game-title">3D Tic-Tac-Toe</h1>
        </div>
        <button class="reset" type="button" data-testid="reset-game">Reset game</button>
      </div>
      <div class="rules-summary">
        <p data-ruleset-name>Most Three in a Row Lines Wins</p>
        <button type="button" data-how-to-play>How to play</button>
      </div>
      <div class="mode-controls" aria-label="Game mode">
        <button type="button" data-mode="local" aria-pressed="true">Two players</button>
        <button type="button" data-mode="bot" aria-pressed="false">Play against bot</button>
        <label class="side-control" hidden>Human plays
          <select data-human-side aria-label="Choose your side">
            <option value="X">X (first)</option>
            <option value="O">O (second)</option>
          </select>
        </label>
      </div>
      <p class="layer-control-label" id="layer-control-label">Select layer for easier placement</p>
      <div class="layer-controls" role="group" aria-labelledby="layer-control-label">
        <button type="button" data-layer="all" aria-pressed="true">All</button>
        <button type="button" data-layer="front" aria-pressed="false">Front</button>
        <button type="button" data-layer="middle" aria-pressed="false">Middle</button>
        <button type="button" data-layer="back" aria-pressed="false">Back</button>
      </div>
      <p class="layer-status" data-layer-status>Selecting: All layers</p>
      <div class="status-row">
        <span class="turn-mark" aria-hidden="true">X</span>
        <strong data-testid="game-status">X's turn</strong>
      </div>
      <div class="fairest-scoreboard" data-fairest-scoreboard>
        <p class="line-score" data-line-score>X lines 0 · O lines 0</p>
        <p class="mark-progress" data-mark-progress>Marks: X 0/13 · O 0/13</p>
      </div>
      <p class="restriction-status" data-restriction-status>X cannot play the center on move 1; it unlocks for O on move 2.</p>
      <p class="instructions">Drag to orbit · Wheel or pinch to zoom · [ / ] cycle layers</p>
    </section>
    <canvas data-testid="board-canvas" tabindex="0" aria-label="3D tic-tac-toe board, 27 cells. Arrow keys move the selection; Page Up and Page Down change height in All mode; brackets cycle layer focus; Enter or Space places."></canvas>
    <details class="accessible-board">
      <summary>Keyboard move grid and instructions</summary>
      <p>Arrow Left and Right move x. Arrow Up and Down move z. Page Up and Page Down move y. Enter or Space places.</p>
      <div class="move-grid" role="grid" aria-label="Tic-tac-toe cells"></div>
    </details>
    <dialog class="rules-dialog" data-rules-dialog aria-labelledby="rules-title">
      <div class="rules-dialog__panel">
        <div class="rules-dialog__header">
          <h2 id="rules-title">How to play</h2>
          <button type="button" data-close-rules aria-label="Close instructions">Close</button>
        </div>
        <ul>
          <li>X cannot choose the center on move 1; it is available to O on move 2.</li>
          <li>Players alternate until each has placed 13 marks, leaving one cell empty.</li>
          <li>Completing three in a row does not end the game early.</li>
          <li>At the end, count every distinct completed line among the canonical 49 lines, including overlaps.</li>
          <li>Most three-in-a-row lines wins; equal scores are a draw.</li>
        </ul>
      </div>
    </dialog>
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-live-status></p>
  </main>
`

const statusElement = app.querySelector<HTMLElement>('[data-testid="game-status"]')!
const restrictionElement = app.querySelector<HTMLElement>('[data-restriction-status]')!
const liveElement = app.querySelector<HTMLElement>('[data-live-status]')!
const turnMark = app.querySelector<HTMLElement>('.turn-mark')!
const resetButton = app.querySelector<HTMLButtonElement>('[data-testid="reset-game"]')!
const canvas = app.querySelector<HTMLCanvasElement>('canvas')!
const moveGrid = app.querySelector<HTMLElement>('.move-grid')!
const localModeButton = app.querySelector<HTMLButtonElement>('[data-mode="local"]')!
const botModeButton = app.querySelector<HTMLButtonElement>('[data-mode="bot"]')!
const sideControl = app.querySelector<HTMLElement>('.side-control')!
const humanSideSelect = app.querySelector<HTMLSelectElement>('[data-human-side]')!
const layerButtons = Array.from(app.querySelectorAll<HTMLButtonElement>('[data-layer]'))
const layerStatus = app.querySelector<HTMLElement>('[data-layer-status]')!
const howToPlayButton = app.querySelector<HTMLButtonElement>('[data-how-to-play]')!
const rulesDialog = app.querySelector<HTMLDialogElement>('[data-rules-dialog]')!
const closeRulesButton = app.querySelector<HTMLButtonElement>('[data-close-rules]')!
const lineScoreElement = app.querySelector<HTMLElement>('[data-line-score]')!
const markProgressElement = app.querySelector<HTMLElement>('[data-mark-progress]')!

let state = createInitialState('fairest')
let activeLayer: LayerSelection = 'all'
let mode: 'local' | 'bot' = 'local'
let humanPlayer: Player = 'X'
let botThinking = false
let botTimer: number | null = null
const buttons = Array.from({ length: 27 }, (_, id) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.cellId = String(id)
  button.setAttribute('role', 'gridcell')
  moveGrid.append(button)
  return button
})

const describeCell = (id: CellId): string => {
  const { x, y, z } = coordinateFromId(id)
  return `x ${x}, y ${y}, z ${z}, ${state.board[id] ?? 'empty'}`
}

let boardView: BoardView

function render(announcement?: string): void {
  const botsTurn = mode === 'bot' && state.status === 'playing' && state.currentPlayer !== humanPlayer
  const text = botThinking && botsTurn ? `${state.currentPlayer} bot is thinking…` : gameStatusText(state)
  const scores = lineScores(state.board)
  const fairestRestrictionActive = state.status === 'playing' && state.moveCount === 0
  statusElement.textContent = text
  localModeButton.setAttribute('aria-pressed', String(mode === 'local'))
  botModeButton.setAttribute('aria-pressed', String(mode === 'bot'))
  sideControl.hidden = mode !== 'bot'
  humanSideSelect.value = humanPlayer
  lineScoreElement.textContent = `X lines ${scores.X} · O lines ${scores.O}`
  const xMarks = state.board.filter((cell) => cell === 'X').length
  const oMarks = state.board.filter((cell) => cell === 'O').length
  markProgressElement.textContent = `Marks: X ${xMarks}/13 · O ${oMarks}/13`
  layerButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.layer === activeLayer))
  })
  layerStatus.textContent = `Selecting: ${layerLabel(activeLayer)}`
  restrictionElement.textContent = fairestRestrictionActive
    ? 'X cannot play the center on move 1; it unlocks for O on move 2.'
    : ''
  restrictionElement.hidden = !fairestRestrictionActive
  turnMark.textContent = state.status === 'draw' ? '—' : state.winner ?? state.currentPlayer
  turnMark.dataset.player = state.status === 'draw' ? 'draw' : state.winner ?? state.currentPlayer
  buttons.forEach((button, id) => {
    const occupied = state.board[id] !== null
    const restricted = isCellRestricted(state, id)
    const outsideLayer = !cellIsInLayer(id, activeLayer)
    button.textContent = restricted ? '🔒' : state.board[id] ?? '·'
    button.disabled = occupied || restricted || outsideLayer || state.status !== 'playing' || botsTurn || botThinking
    const restrictionLabel = restricted ? ', unavailable to X on move one' : ''
    button.setAttribute('aria-label', `${describeCell(id)}${restrictionLabel}${outsideLayer ? ', outside selected layer' : ''}`)
    if (restricted) button.dataset.locked = 'true'
    else delete button.dataset.locked
    if (outsideLayer) button.dataset.outsideLayer = 'true'
    else delete button.dataset.outsideLayer
    if (state.winningLine?.includes(id)) button.dataset.winning = 'true'
    else delete button.dataset.winning
  })
  boardView?.sync(state)
  if (announcement) liveElement.textContent = announcement
}

function clearBotTimer(): void {
  if (botTimer !== null) window.clearTimeout(botTimer)
  botTimer = null
  botThinking = false
}

function isBotTurn(): boolean {
  return mode === 'bot' && state.status === 'playing' && state.currentPlayer !== humanPlayer
}

function scheduleBotMove(): void {
  if (!isBotTurn()) return
  botThinking = true
  render(`${state.currentPlayer} bot is thinking.`)
  const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320
  botTimer = window.setTimeout(() => {
    botTimer = null
    const move = chooseBotMove(state)
    botThinking = false
    if (move !== null) performMove(move, 'bot')
    else render()
  }, delay)
}

function performMove(cellId: CellId, actor: 'human' | 'bot'): void {
  if (actor === 'human' && (botThinking || isBotTurn())) {
    liveElement.textContent = 'Wait for the bot to move.'
    return
  }
  const previous = state
  state = gameReducer(state, { type: 'PLACE', cellId })
  if (state === previous) {
    if (previous.status !== 'playing') liveElement.textContent = 'Game over. Reset to play again.'
    else if (previous.board[cellId]) liveElement.textContent = 'Cell occupied'
    else if (isCellRestricted(previous, cellId)) {
      liveElement.textContent = 'Center unavailable to X on move 1; choose another cell.'
    }
    return
  }
  const playerLabel = actor === 'bot' ? `${previous.currentPlayer} bot` : previous.currentPlayer
  render(state.status === 'playing' ? `${playerLabel} placed. ${gameStatusText(state)}` : gameStatusText(state))
  if (actor === 'human') scheduleBotMove()
}

const place = (cellId: CellId): void => performMove(cellId, 'human')

buttons.forEach((button, id) => {
  button.addEventListener('click', () => place(id))
  button.addEventListener('focus', () => boardView.focusCell(id))
  button.addEventListener('keydown', (event) => {
    const { x, y, z } = coordinateFromId(id)
    let nextId = id
    if (activeLayer !== 'all') {
      if (event.key === 'ArrowLeft' && x > -1) nextId = id - 1
      else if (event.key === 'ArrowRight' && x < 1) nextId = id + 1
      else if (event.key === 'ArrowUp' && y < 1) nextId = id + 3
      else if (event.key === 'ArrowDown' && y > -1) nextId = id - 3
      else return
    } else if (event.key === 'ArrowLeft' && x > -1) nextId = id - 1
    else if (event.key === 'ArrowRight' && x < 1) nextId = id + 1
    else if (event.key === 'ArrowUp' && z < 1) nextId = id + 9
    else if (event.key === 'ArrowDown' && z > -1) nextId = id - 9
    else if (event.key === 'PageUp' && y < 1) nextId = id + 3
    else if (event.key === 'PageDown' && y > -1) nextId = id - 3
    else return
    event.preventDefault()
    buttons[nextId].focus()
  })
})

function resetGame(announcement: string): void {
  clearBotTimer()
  state = createInitialState(state.variation)
  render(announcement)
  scheduleBotMove()
}

resetButton.addEventListener('click', () => resetGame('Game reset. X starts.'))
localModeButton.addEventListener('click', () => {
  mode = 'local'
  resetGame('Two-player mode. X starts.')
})
botModeButton.addEventListener('click', () => {
  mode = 'bot'
  resetGame(`Bot mode. You play ${humanPlayer}.`)
})
humanSideSelect.addEventListener('change', () => {
  humanPlayer = humanSideSelect.value as Player
  resetGame(`Side changed. You play ${humanPlayer}.`)
})
howToPlayButton.addEventListener('click', () => {
  rulesDialog.showModal()
  closeRulesButton.focus()
})
closeRulesButton.addEventListener('click', () => rulesDialog.close())
rulesDialog.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    event.preventDefault()
    closeRulesButton.focus()
  }
})
rulesDialog.addEventListener('close', () => howToPlayButton.focus())

function selectLayer(layer: LayerSelection): void {
  if (layer === activeLayer) return
  const focusedCell = document.activeElement instanceof HTMLButtonElement
    ? Number(document.activeElement.dataset.cellId)
    : null
  activeLayer = layer
  boardView.setLayer(layer)
  render()
  liveElement.textContent = `Selecting: ${layerLabel(layer)}`
  if (focusedCell !== null && Number.isInteger(focusedCell)) {
    const preferred = cellIsInLayer(focusedCell, layer) ? focusedCell : layerCellIds(layer)[4]
    const target = buttons[preferred]
    if (!target.disabled) target.focus()
  }
}

layerButtons.forEach((button) => {
  button.addEventListener('click', () => selectLayer(button.dataset.layer as LayerSelection))
})
document.addEventListener('keydown', (event) => {
  if (event.key !== '[' && event.key !== ']') return
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return
  event.preventDefault()
  selectLayer(cycleLayer(activeLayer, event.key === ']' ? 1 : -1))
})

boardView = new BoardView(canvas, state, {
  onPlace: place,
  onHover: () => undefined,
  onCursor: (cellId) => { liveElement.textContent = describeCell(cellId) },
})
render()
