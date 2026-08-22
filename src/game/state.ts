import { isCellId, type CellId } from './coordinates'
import { completedLines, lineScores } from './selectors'
import type { WinningLine } from './winningLines'

export type Player = 'X' | 'O'
export type Cell = Player | null
export type GameStatus = 'playing' | 'won' | 'draw'
export type RuleVariation = 'classic' | 'fairest'

export type GameState = Readonly<{
  board: readonly Cell[]
  currentPlayer: Player
  status: GameStatus
  winner: Player | null
  winningLine: WinningLine | null
  moveCount: number
  variation: RuleVariation
}>

export type GameAction =
  | Readonly<{ type: 'PLACE'; cellId: CellId }>
  | Readonly<{ type: 'RESET' }>
  | Readonly<{ type: 'SET_VARIATION'; variation: RuleVariation }>

export const OPENING_RESTRICTION_PLIES = 8
export const OPENING_RESTRICTED_CELLS: readonly CellId[] = Object.freeze([
  0, 2, 6, 8, 13, 18, 20, 24, 26,
])

export type OpeningMarkProgress = Readonly<{ X: number; O: number }>

export function openingMarkProgress(state: GameState): OpeningMarkProgress {
  const acceptedOpeningMarks = Math.min(state.moveCount, OPENING_RESTRICTION_PLIES)
  return {
    X: Math.min(4, Math.ceil(acceptedOpeningMarks / 2)),
    O: Math.min(4, Math.floor(acceptedOpeningMarks / 2)),
  }
}

export function isCellRestricted(state: GameState, cellId: CellId): boolean {
  if (state.variation === 'fairest') {
    return state.status === 'playing' && state.moveCount === 0 && state.currentPlayer === 'X' && cellId === 13
  }
  const progress = openingMarkProgress(state)
  return state.status === 'playing'
    && (progress.X < 4 || progress.O < 4)
    && OPENING_RESTRICTED_CELLS.includes(cellId)
}

export function movesUntilRestrictedCellsUnlock(state: GameState): number {
  const progress = openingMarkProgress(state)
  return (4 - progress.X) + (4 - progress.O)
}

export function createInitialState(variation: RuleVariation = 'classic'): GameState {
  return {
    board: Object.freeze(Array<Cell>(27).fill(null)),
    currentPlayer: 'X',
    status: 'playing',
    winner: null,
    winningLine: null,
    moveCount: 0,
    variation,
  }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'RESET') return createInitialState(state.variation)
  if (action.type === 'SET_VARIATION') return createInitialState(action.variation)
  if (
    state.status !== 'playing'
    || !isCellId(action.cellId)
    || state.board[action.cellId] !== null
    || isCellRestricted(state, action.cellId)
  ) {
    return state
  }

  const board = [...state.board]
  board[action.cellId] = state.currentPlayer
  const moveCount = state.moveCount + 1
  const winningLines = completedLines(board, state.currentPlayer)

  if (state.variation === 'fairest') {
    if (moveCount === 26) {
      const scores = lineScores(board)
      const winner: Player | null = scores.X === scores.O ? null : scores.X > scores.O ? 'X' : 'O'
      return {
        board: Object.freeze(board),
        currentPlayer: state.currentPlayer,
        status: winner ? 'won' : 'draw',
        winner,
        winningLine: null,
        moveCount,
        variation: state.variation,
      }
    }
    return {
      board: Object.freeze(board),
      currentPlayer: state.currentPlayer === 'X' ? 'O' : 'X',
      status: 'playing',
      winner: null,
      winningLine: null,
      moveCount,
      variation: state.variation,
    }
  }

  if (winningLines.length > 0) {
    return {
      board: Object.freeze(board),
      currentPlayer: state.currentPlayer,
      status: 'won',
      winner: state.currentPlayer,
      winningLine: winningLines[0],
      moveCount,
      variation: state.variation,
    }
  }

  if (moveCount === 27) {
    return {
      board: Object.freeze(board),
      currentPlayer: state.currentPlayer,
      status: 'draw',
      winner: null,
      winningLine: null,
      moveCount,
      variation: state.variation,
    }
  }

  return {
    board: Object.freeze(board),
    currentPlayer: state.currentPlayer === 'X' ? 'O' : 'X',
    status: 'playing',
    winner: null,
    winningLine: null,
    moveCount,
    variation: state.variation,
  }
}
