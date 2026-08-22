import { describe, expect, it } from 'vitest'
import { gameStatusText } from './presentation'
import { lineScores } from './selectors'
import { createInitialState, gameReducer, type Cell, type GameState } from './state'

const play = (sequence: readonly number[]): GameState => sequence.reduce(
  (state, cellId) => gameReducer(state, { type: 'PLACE', cellId }),
  createInitialState('fairest'),
)

describe('Fairest variation', () => {
  it('blocks only X from the center on move one and allows O there on move two', () => {
    const initial = createInitialState('fairest')
    expect(initial.variation).toBe('fairest')
    expect(gameReducer(initial, { type: 'PLACE', cellId: 13 })).toBe(initial)
    const afterX = gameReducer(initial, { type: 'PLACE', cellId: 1 })
    const afterO = gameReducer(afterX, { type: 'PLACE', cellId: 13 })
    expect(afterO.board[1]).toBe('X')
    expect(afterO.board[13]).toBe('O')
    expect(afterO.moveCount).toBe(2)
  })

  it('counts distinct overlapping completed lines for both players', () => {
    const board = Array<Cell>(27).fill(null)
    for (const id of [0, 1, 2, 3, 6]) board[id] = 'X'
    for (const id of [9, 10, 11]) board[id] = 'O'
    expect(lineScores(board)).toEqual({ X: 2, O: 1 })
  })

  it('does not stop when a line is completed before the final placement', () => {
    const state = play([0, 3, 1, 4, 2])
    expect(lineScores(state.board).X).toBe(1)
    expect(state.status).toBe('playing')
    expect(state.winner).toBeNull()
    expect(state.moveCount).toBe(5)
  })

  it('finishes after exactly 13 marks each and awards the higher line score', () => {
    const sequence = Array.from({ length: 26 }, (_, id) => id)
    const state = play(sequence)
    expect(state.board.filter((cell) => cell === 'X')).toHaveLength(13)
    expect(state.board.filter((cell) => cell === 'O')).toHaveLength(13)
    expect(state.board.filter((cell) => cell === null)).toHaveLength(1)
    expect(lineScores(state.board)).toEqual({ X: 9, O: 6 })
    expect(state.status).toBe('won')
    expect(state.winner).toBe('X')
    expect(gameStatusText(state)).toBe('X wins — 9 lines to 6')
    expect(state.moveCount).toBe(26)
    expect(gameReducer(state, { type: 'PLACE', cellId: 26 })).toBe(state)
  })

  it('declares a draw when final line scores are equal', () => {
    const sequence = [3, 1, 5, 2, 6, 4, 8, 7, 9, 10, 11, 16, 12, 18, 13, 20, 14, 21, 15, 22, 17, 23, 19, 24, 26, 25]
    const state = play(sequence)
    expect(lineScores(state.board)).toEqual({ X: 6, O: 6 })
    expect(state.status).toBe('draw')
    expect(state.winner).toBeNull()
    expect(gameStatusText(state)).toBe('Draw — 6 lines each')
    expect(state.moveCount).toBe(26)
  })

  it('switches variations by returning a fresh matching state', () => {
    const classic = gameReducer(play([1, 3]), { type: 'SET_VARIATION', variation: 'classic' })
    expect(classic).toEqual(createInitialState('classic'))
    const fairest = gameReducer(classic, { type: 'SET_VARIATION', variation: 'fairest' })
    expect(fairest).toEqual(createInitialState('fairest'))
  })
})
