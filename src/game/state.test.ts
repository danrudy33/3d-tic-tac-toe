import { describe, expect, it } from 'vitest'
import { completedLines } from './selectors'
import {
  createInitialState,
  gameReducer,
  openingMarkProgress,
  type GameState,
} from './state'

describe('game state', () => {
  it('creates the exact initial state', () => {
    expect(createInitialState()).toEqual({
      board: Array(27).fill(null),
      currentPlayer: 'X',
      status: 'playing',
      winner: null,
      winningLine: null,
      moveCount: 0,
      variation: 'classic',
    })
  })

  it('immutably places marks and alternates turns', () => {
    const initial = createInitialState()
    const afterX = gameReducer(initial, { type: 'PLACE', cellId: 1 })
    expect(afterX).not.toBe(initial)
    expect(afterX.board).not.toBe(initial.board)
    expect(initial.board[1]).toBeNull()
    expect(afterX.board[1]).toBe('X')
    expect(afterX.currentPlayer).toBe('O')
    expect(afterX.moveCount).toBe(1)
  })

  it('tracks accepted opening marks per player and ignores rejected attempts', () => {
    let state = createInitialState()
    expect(openingMarkProgress(state)).toEqual({ X: 0, O: 0 })
    expect(gameReducer(state, { type: 'PLACE', cellId: 13 })).toBe(state)
    expect(openingMarkProgress(state)).toEqual({ X: 0, O: 0 })
    for (const cellId of [1, 3, 5] as const) state = gameReducer(state, { type: 'PLACE', cellId })
    expect(openingMarkProgress(state)).toEqual({ X: 2, O: 1 })
  })

  it.each([0, 2, 6, 8, 13, 18, 20, 24, 26] as const)(
    'rejects restricted cell %i during the first eight accepted plies without consuming a turn',
    (cellId) => {
      const initial = createInitialState()
      expect(gameReducer(initial, { type: 'PLACE', cellId })).toBe(initial)
      expect(initial.currentPlayer).toBe('X')
      expect(initial.moveCount).toBe(0)
    },
  )

  it('unlocks corners and center on the ninth accepted ply', () => {
    let state = createInitialState()
    for (const cellId of [1, 3, 5, 7] as const) state = gameReducer(state, { type: 'PLACE', cellId })
    expect(gameReducer(state, { type: 'PLACE', cellId: 13 })).toBe(state)
    for (const cellId of [9, 10, 12, 14] as const) state = gameReducer(state, { type: 'PLACE', cellId })
    expect(state.status).toBe('playing')
    expect(state.moveCount).toBe(8)
    const unlocked = gameReducer(state, { type: 'PLACE', cellId: 13 })
    expect(unlocked.board[13]).toBe('X')
    expect(unlocked.moveCount).toBe(9)
  })

  it('returns the same object for invalid and occupied placements', () => {
    const initial = createInitialState()
    expect(gameReducer(initial, { type: 'PLACE', cellId: -1 })).toBe(initial)
    const placed = gameReducer(initial, { type: 'PLACE', cellId: 1 })
    expect(gameReducer(placed, { type: 'PLACE', cellId: 1 })).toBe(placed)
  })

  it.each([
    ['axis', [0, 1, 2], [3, 5]],
    ['face', [0, 4, 8], [1, 2]],
    ['space', [0, 13, 26], [1, 2]],
  ] as const)('detects a %s win and locks the game', (_category, line, replies) => {
    let state: GameState = { ...createInitialState(), moveCount: 8 }
    for (const cellId of [line[0], replies[0], line[1], replies[1], line[2]]) {
      state = gameReducer(state, { type: 'PLACE', cellId })
    }
    expect(state.status).toBe('won')
    expect(state.winner).toBe('X')
    expect(state.winningLine).toEqual(line)
    expect(state.currentPlayer).toBe('X')
    expect(gameReducer(state, { type: 'PLACE', cellId: 10 })).toBe(state)
  })

  it('evaluates a final-move win before draw', () => {
    const board = Array<'X' | 'O' | null>(27).fill('O')
    board[0] = 'X'
    board[1] = 'X'
    board[2] = null
    const state: GameState = {
      board,
      currentPlayer: 'X',
      status: 'playing',
      winner: null,
      winningLine: null,
      moveCount: 26,
      variation: 'classic',
    }
    expect(gameReducer(state, { type: 'PLACE', cellId: 2 }).status).toBe('won')
  })

  it('defensively handles a malformed full-board state whose earlier win was not recorded', () => {
    const board = Array<'X' | 'O' | null>(27).fill('O')
    board[13] = null
    expect(completedLines(board, 'O').length).toBeGreaterThan(0)

    const state: GameState = {
      board,
      currentPlayer: 'X',
      status: 'playing',
      winner: null,
      winningLine: null,
      moveCount: 26,
      variation: 'classic',
    }
    const draw = gameReducer(state, { type: 'PLACE', cellId: 13 })

    expect(draw.status).toBe('draw')
    expect(draw.winner).toBeNull()
    expect(draw.winningLine).toBeNull()
    expect(draw.currentPlayer).toBe('X')
  })

  it.each(['playing', 'won', 'draw'] as const)('resets from %s', (status) => {
    const state: GameState = { ...createInitialState(), status }
    expect(gameReducer(state, { type: 'RESET' })).toEqual(createInitialState())
    expect(gameReducer(state, { type: 'RESET' })).not.toBe(state)
  })
})
